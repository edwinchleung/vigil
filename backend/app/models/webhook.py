from pydantic import BaseModel, Field


class EmailWebhookPayload(BaseModel):
    email_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)


class IntentWebhookPayload(BaseModel):
    intent_id: str = Field(min_length=1)
    user_id: str = Field(min_length=1)
