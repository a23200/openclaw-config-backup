import lancedb
import logging
import time
from sentence_transformers import SentenceTransformer
from memory_system.schema import MemoryRecord, VECTOR_DIMENSION

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

DB_PATH = "./lancedb_data"
MODEL_NAME = 'all-MiniLM-L6-v2' 

class MemoryManager:
    def __init__(self):
        self.db = lancedb.connect(DB_PATH)
        self.table = self._initialize_table()
        self.model = self._load_model()

    def _initialize_table(self):
        try:
            table = self.db.open_table(MemoryRecord._table_name)
            logging.info(f"成功打开已存在的表: {MemoryRecord._table_name}")
            return table
        except ValueError:
            logging.info(f"表 {MemoryRecord._table_name} 不存在，将创建新表。")
            return self.db.create_table(MemoryRecord._table_name, schema=MemoryRecord, mode="overwrite")

    def _load_model(self):
        try:
            model = SentenceTransformer(MODEL_NAME)
            assert model.get_sentence_embedding_dimension() == VECTOR_DIMENSION
            logging.info(f"成功加载句子嵌入模型: {MODEL_NAME}")
            return model
        except Exception as e:
            logging.error(f"加载模型时发生错误: {e}")
            return None

    def add_memory(self, text: str, category: str = "other", importance: float = 0.7, source: str = "manual"):
        if not self.model:
            logging.error("模型未加载，无法添加记忆。")
            return
        try:
            vector = self.model.encode(text, convert_to_tensor=False).tolist()
            # **FIX**: Manually add the timestamp to the data dictionary.
            memory_data = {
                "text": text, 
                "vector": vector, 
                "category": category, 
                "importance": importance, 
                "source": source,
                "timestamp": time.time() # Explicitly add timestamp
            }
            self.table.add([memory_data])
            logging.info(f"成功添加记忆: {text[:50]}...")
        except Exception as e:
            logging.error(f"添加记忆时发生错误: {e}")

    def search_memory(self, query: str, limit: int = 5, category_filter: str = None):
        if not self.model:
            logging.error("模型未加载，无法搜索记忆。")
            return []
        try:
            # **FIX**: Encode the query string into a vector before searching.
            query_vector = self.model.encode(query, convert_to_tensor=False).tolist()
            
            # Pass the query_vector to the search method.
            search_query = self.table.search(query_vector)
            
            if category_filter:
                search_query = search_query.where(f"category = '{category_filter}'")
            
            results = search_query.limit(limit).to_pydantic(MemoryRecord)
            logging.info(f"为查询 '{query[:50]}...' 找到 {len(results)} 条结果。")
            return results
        except Exception as e:
            logging.error(f"搜索记忆时发生错误: {e}")
            return []

if __name__ == '__main__':
    manager = MemoryManager()
    
    print("清空旧的测试数据...")
    manager.db.drop_table(MemoryRecord._table_name, ignore_missing=True)
    manager.table = manager.db.create_table(MemoryRecord._table_name, schema=MemoryRecord, mode="overwrite")

    print("\\n--- 添加测试记忆 ---")
    manager.add_memory("我最喜欢喝冰美式。", category="preference", importance=0.9, source="conversation_log")
    manager.add_memory("升级记忆系统需要使用 LanceDB。", category="decision", importance=0.8, source="self_reflection")
    manager.add_memory("用户喜欢简洁、直接的沟通方式。", category="preference", importance=0.9, source="manual")
    manager.add_memory("备份文件应该上传到 a23200/openclaw-config-backup 仓库。", category="fact", importance=0.7, source="instruction")
    
    print("\\n--- 正在搜索关于'咖啡'的记忆 ---")
    search_results = manager.search_memory("我喜欢喝什么咖啡？")
    for res in search_results:
        print(f"  - [相似度: {res._distance:.2f}] {res.text} (分类: {res.category})")

    print("\\n--- 正在搜索关于'数据库'的记忆 ---")
    search_results = manager.search_memory("用什么技术升级系统？")
    for res in search_results:
        print(f"  - [相似度: {res._distance:.2f}] {res.text} (分类: {res.category})")

    print("\\n--- 正在按'preference'分类搜索'用户偏好' ---")
    search_results = manager.search_memory("用户的偏好是什么？", category_filter="preference")
    for res in search_results:
        print(f"  - [相似度: {res._distance:.2f}] {res.text} (分类: {res.category})")
