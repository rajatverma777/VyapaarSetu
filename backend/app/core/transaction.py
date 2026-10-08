from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClientSession
from app.core.database import db_instance
import logging

logger = logging.getLogger(__name__)

class UnitOfWork:
    """
    Unit of Work / Transaction manager for atomic multi-document operations.
    Leverages native MongoDB replica set transactions where available,
    and handles graceful fallback in standalone development environments.
    """
    def __init__(self, client=None):
        self.client = client or db_instance.client
        self.session: Optional[AsyncIOMotorClientSession] = None
        self.in_transaction: bool = False

    async def __aenter__(self):
        if not self.client:
            return self
        try:
            self.session = await self.client.start_session()
            self.session.start_transaction()
            self.in_transaction = True
        except Exception as e:
            # Standalone MongoDB instances do not support replica set transactions
            logger.debug(f"Transactions disabled or standalone MongoDB mode: {e}")
            self.session = None
            self.in_transaction = False
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session and self.in_transaction:
            try:
                if exc_type is not None:
                    await self.session.abort_transaction()
                    logger.warning("MongoDB transaction aborted due to exception")
                else:
                    await self.session.commit_transaction()
            except Exception as e:
                logger.error(f"Error finalizing MongoDB transaction: {e}")
                raise
            finally:
                await self.session.end_session()
                self.session = None
                self.in_transaction = False
