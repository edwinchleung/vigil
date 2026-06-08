import asyncio
from dataclasses import dataclass


@dataclass(slots=True)
class EmailTask:
    email_id: str
    user_id: str


@dataclass(slots=True)
class IntentTask:
    intent_id: str
    user_id: str


Task = EmailTask | IntentTask


class TaskQueue:
    def __init__(self, maxsize: int) -> None:
        self._queue: asyncio.Queue[Task] = asyncio.Queue(maxsize=maxsize)

    async def enqueue(self, task: Task) -> None:
        await self._queue.put(task)

    async def dequeue(self) -> Task:
        return await self._queue.get()

    def task_done(self) -> None:
        self._queue.task_done()

    def qsize(self) -> int:
        return self._queue.qsize()
