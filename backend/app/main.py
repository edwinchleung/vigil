import asyncio
from contextlib import asynccontextmanager

import logging
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.webhooks import router as webhooks_router
from app.config import Settings
from app.services.email_repository import EmailRepository
from app.services.pipeline import process_task
from app.worker.queue import EmailTask, TaskQueue
from app.worker.runner import WorkerRunner

settings = Settings()


def _configure_logging() -> None:
    # Must run in the actual server process too (reload spawns subprocesses).
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        force=True,
    )
    logging.getLogger("app").setLevel(logging.INFO)


def create_app(app_settings: Settings | None = None) -> FastAPI:
    _configure_logging()
    runtime_settings = app_settings or settings

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.settings = runtime_settings
        app.state.task_queue = TaskQueue(maxsize=runtime_settings.queue_maxsize)
        app.state.worker_runner = None
        app.state.analysis_poller_task = None
        if runtime_settings.enable_worker:
            app.state.worker_runner = WorkerRunner(
                task_queue=app.state.task_queue,
                task_handler=lambda task: process_task(task, runtime_settings),
            )
            await app.state.worker_runner.start()

            async def poll_analysis_requests() -> None:
                repo = EmailRepository.from_settings(runtime_settings)
                while True:
                    await asyncio.sleep(runtime_settings.analysis_request_poll_interval_sec)

                    if (
                        app.state.task_queue.qsize()
                        >= runtime_settings.queue_backpressure_high_watermark
                    ):
                        continue

                    rows = repo.list_pending_analysis_requests(
                        limit=runtime_settings.analysis_request_batch_size
                    )
                    if not rows:
                        continue

                    for r in rows:
                        request_id = str(r.get("id") or "")
                        user_id = str(r.get("userId") or "")
                        mode = str(r.get("mode") or "")
                        email_id = r.get("emailId")
                        email_id_s = str(email_id) if isinstance(email_id, str) else None

                        if not request_id or not user_id or not mode:
                            continue

                        try:
                            if not repo.claim_analysis_request(request_id=request_id):
                                continue

                            if mode == "single":
                                if not email_id_s:
                                    repo.mark_analysis_request_failed(
                                        request_id=request_id, error="missing emailId for single"
                                    )
                                    continue
                                # Validate ownership before enqueueing to prevent spam/noise.
                                if repo.get_email(email_id=email_id_s, user_id=user_id) is None:
                                    repo.mark_analysis_request_failed(
                                        request_id=request_id, error="emailId not found for user"
                                    )
                                    continue
                                await app.state.task_queue.enqueue(
                                    EmailTask(email_id=email_id_s, user_id=user_id)
                                )
                                repo.mark_analysis_request_done(request_id=request_id)
                                continue

                            if mode == "all_unanalyzed":
                                emails = repo.list_emails_needing_analysis(
                                    user_id=user_id,
                                    limit=runtime_settings.analysis_all_unanalyzed_limit,
                                    include_failed=True,
                                )
                                enqueued = 0
                                for e in emails:
                                    if (
                                        app.state.task_queue.qsize()
                                        >= runtime_settings.queue_backpressure_high_watermark
                                    ):
                                        break
                                    eid = e.get("id")
                                    if not isinstance(eid, str) or not eid:
                                        continue
                                    await app.state.task_queue.enqueue(
                                        EmailTask(email_id=eid, user_id=user_id)
                                    )
                                    enqueued += 1
                                repo.mark_analysis_request_done(request_id=request_id)
                                continue

                            repo.mark_analysis_request_failed(
                                request_id=request_id, error=f"unknown mode: {mode}"
                            )
                        except Exception as exc:  # noqa: BLE001
                            try:
                                repo.mark_analysis_request_failed(
                                    request_id=request_id, error=str(exc)
                                )
                            except Exception:  # noqa: BLE001
                                pass

            app.state.analysis_poller_task = asyncio.create_task(
                poll_analysis_requests(), name="analysis-request-poller"
            )
        try:
            yield
        finally:
            if app.state.analysis_poller_task is not None:
                app.state.analysis_poller_task.cancel()
                try:
                    await app.state.analysis_poller_task
                except asyncio.CancelledError:
                    pass
            if app.state.worker_runner is not None:
                await app.state.worker_runner.stop()

    app = FastAPI(title="Vigil API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=runtime_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "X-Timestamp", "X-Signature"],
    )
    app.include_router(webhooks_router)
    return app


app = create_app()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


def run() -> None:
    """Entrypoint for `uv run vigil-api` or `python -m app.main` style usage."""
    _configure_logging()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True,
        log_level="info",
    )


if __name__ == "__main__":
    run()
