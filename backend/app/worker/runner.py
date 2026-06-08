import asyncio
import logging
from collections.abc import Awaitable, Callable

from app.worker.queue import Task, TaskQueue

logger = logging.getLogger(__name__)

TaskHandler = Callable[[Task], Awaitable[None]]


class WorkerRunner:
    def __init__(self, task_queue: TaskQueue, task_handler: TaskHandler) -> None:
        self._task_queue = task_queue
        self._task_handler = task_handler
        self._runner_task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._runner_task is not None:
            return
        self._runner_task = asyncio.create_task(self._run_loop(), name="email-task-worker")

    async def stop(self) -> None:
        if self._runner_task is None:
            return
        self._runner_task.cancel()
        try:
            await self._runner_task
        except asyncio.CancelledError:
            pass
        finally:
            self._runner_task = None

    async def _run_loop(self) -> None:
        while True:
            task = await self._task_queue.dequeue()
            try:
                await self._task_handler(task)
            except Exception:  # noqa: BLE001
                logger.exception("Worker failed for email task", extra={"task": task})
            finally:
                self._task_queue.task_done()
