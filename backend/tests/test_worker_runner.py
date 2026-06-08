import asyncio

from app.worker.queue import EmailTask, IntentTask, TaskQueue
from app.worker.runner import WorkerRunner


def test_worker_runner_continues_after_task_failure() -> None:
    async def scenario() -> None:
        queue = TaskQueue(maxsize=10)
        seen: list[str] = []

        async def handler(task) -> None:
            if isinstance(task, EmailTask):
                seen.append(task.email_id)
                if task.email_id == "email-1":
                    raise RuntimeError("boom")
            else:
                raise AssertionError("unexpected task type")

        runner = WorkerRunner(queue, handler)
        await runner.start()
        await queue.enqueue(EmailTask(email_id="email-1", user_id="user-1"))
        await queue.enqueue(EmailTask(email_id="email-2", user_id="user-1"))

        for _ in range(30):
            if len(seen) == 2:
                break
            await asyncio.sleep(0.01)

        await runner.stop()
        assert seen == ["email-1", "email-2"]

    asyncio.run(scenario())


def test_worker_runner_can_process_different_task_types() -> None:
    async def scenario() -> None:
        queue = TaskQueue(maxsize=10)
        seen: list[str] = []

        async def handler(task) -> None:
            if isinstance(task, EmailTask):
                seen.append(f"email:{task.email_id}")
            elif isinstance(task, IntentTask):
                seen.append(f"intent:{task.intent_id}")
            else:
                raise AssertionError("unexpected task type")

        runner = WorkerRunner(queue, handler)
        await runner.start()
        await queue.enqueue(IntentTask(intent_id="intent-1", user_id="user-1"))
        await queue.enqueue(EmailTask(email_id="email-1", user_id="user-1"))

        for _ in range(30):
            if len(seen) == 2:
                break
            await asyncio.sleep(0.01)

        await runner.stop()
        assert seen == ["intent:intent-1", "email:email-1"]

    asyncio.run(scenario())
