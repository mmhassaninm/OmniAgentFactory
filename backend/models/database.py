import os
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from services.encryption import encrypt, decrypt
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

# Check if MONGO_URI includes DB name, otherwise add logic for it.
MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URI") or "mongodb://localhost:27017/omnibot"
if os.path.exists("/.dockerenv"):
    MONGO_URI = MONGO_URI.replace("localhost", "mongo").replace("127.0.0.1", "mongo")
client = AsyncIOMotorClient(MONGO_URI)

# If MONGO_URI doesn't have a DB name appended, default to omnibot
db = client.get_database("omnibot")
if hasattr(client, "get_default_database"):
    try:
        db = client.get_default_database()
    except Exception:
        pass

class ChatHistoryModel(BaseModel):
    userId: str = "local_user"
    role: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def to_mongo(self) -> dict:
        data = self.model_dump()
        data["content"] = encrypt(data["content"])
        return data

    @classmethod
    def from_mongo(cls, doc: dict):
        if not doc:
            return None
        doc["content"] = decrypt(doc.get("content", ""))
        return cls(**doc)

async def save_chat_message(role: str, content: str, user_id: str = "local_user") -> str:
    msg = ChatHistoryModel(role=role, content=content, userId=user_id)
    result = await db.chat_history.insert_one(msg.to_mongo())
    return str(result.inserted_id)

async def get_chat_history(user_id: str = "local_user", limit: int = 50) -> list:
    cursor = db.chat_history.find({"userId": user_id}).sort("timestamp", 1).limit(limit)
    docs = await cursor.to_list(length=limit)
    return [ChatHistoryModel.from_mongo(doc).model_dump() for doc in docs]
