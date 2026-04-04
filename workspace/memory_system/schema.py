import time
from typing import ClassVar
from pydantic import Field
import lancedb.pydantic as ldb

# all-MiniLM-L6-v2 模型的向量维度是 384
VECTOR_DIMENSION = 384

class MemoryRecord(ldb.LanceModel):
    _table_name: ClassVar[str] = "structured_memory"
    
    # 向量字段是语义搜索的核心
    vector: ldb.vector(VECTOR_DIMENSION)

    # 普通的元数据字段
    text: str = Field(default="")
    category: str = Field(default="other")
    importance: float = Field(default=0.7)
    timestamp: float = Field(default_factory=time.time)
    source: str = Field(default="manual")
