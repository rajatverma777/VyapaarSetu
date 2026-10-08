from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class BaseRepository:
    """Base repository enforcing tenant isolation across all MongoDB collections."""

    def __init__(self, db, tenant_id: str, collection_name: str):
        self.db = db
        self.tenant_id = tenant_id
        self.collection_name = collection_name
        self.collection = db[collection_name]

    def _to_object_id(self, doc_id: Union[str, ObjectId]) -> Optional[ObjectId]:
        if isinstance(doc_id, ObjectId):
            return doc_id
        if ObjectId.is_valid(doc_id):
            return ObjectId(doc_id)
        return None

    def _scope_query(self, query: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        q = dict(query) if query else {}
        if self.tenant_id and "tenant_id" not in q:
            q["tenant_id"] = self.tenant_id
        return q

    async def get_by_id(self, doc_id: Union[str, ObjectId], session=None) -> Optional[Dict[str, Any]]:
        if not doc_id:
            return None
        oid = self._to_object_id(doc_id)
        lookup_id = oid if oid is not None else doc_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        return await self.collection.find_one(query, **kwargs)

    async def find_one(self, query: Dict[str, Any], session=None) -> Optional[Dict[str, Any]]:
        query = self._scope_query(query)
        kwargs = {"session": session} if session else {}
        return await self.collection.find_one(query, **kwargs)

    async def find(
        self,
        query: Optional[Dict[str, Any]] = None,
        sort: Optional[List[tuple]] = None,
        skip: int = 0,
        limit: int = 50,
        session=None
    ) -> List[Dict[str, Any]]:
        query = self._scope_query(query)
        cursor = self.collection.find(query, session=session)
        if sort:
            cursor = cursor.sort(sort)
        if skip:
            cursor = cursor.skip(skip)
        if limit:
            cursor = cursor.limit(limit)
        return await cursor.to_list(length=limit)

    async def count(self, query: Optional[Dict[str, Any]] = None, session=None) -> int:
        query = self._scope_query(query)
        kwargs = {"session": session} if session else {}
        return await self.collection.count_documents(query, **kwargs)

    async def create(self, document: Dict[str, Any], session=None) -> str:
        doc = dict(document)
        if self.tenant_id:
            doc["tenant_id"] = self.tenant_id
        if "created_at" not in doc:
            doc["created_at"] = datetime.utcnow()
        kwargs = {"session": session} if session else {}
        res = await self.collection.insert_one(doc, **kwargs)
        return str(res.inserted_id)

    async def update_by_id(
        self,
        doc_id: Union[str, ObjectId],
        update_dict: Dict[str, Any],
        session=None
    ) -> bool:
        if not doc_id:
            return False
        oid = self._to_object_id(doc_id)
        lookup_id = oid if oid is not None else doc_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        if not any(k.startswith("$") for k in update_dict.keys()):
            update_op = {"$set": update_dict}
        else:
            update_op = update_dict
        res = await self.collection.update_one(query, update_op, **kwargs)
        return res.modified_count > 0

    async def delete_by_id(self, doc_id: Union[str, ObjectId], session=None) -> bool:
        if not doc_id:
            return False
        oid = self._to_object_id(doc_id)
        lookup_id = oid if oid is not None else doc_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        res = await self.collection.delete_one(query, **kwargs)
        return res.deleted_count > 0
