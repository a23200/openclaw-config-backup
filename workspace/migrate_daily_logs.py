import os
import logging
from memory_system.core import MemoryManager

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# 定义记忆文件夹路径
MEMORY_DIR = "./memory"

def migrate_daily_logs():
    """
    扫描 memory/ 文件夹，读取所有 .md 文件，
    并将它们的逐行内容存入 LanceDB 记忆库。
    """
    logging.info("--- 开始迁移每日记忆文件 ---")
    
    # 1. 初始化 MemoryManager
    try:
        manager = MemoryManager()
        logging.info("MemoryManager 初始化成功。")
    except Exception as e:
        logging.error(f"MemoryManager 初始化失败: {e}")
        return

    # 2. 检查 memory 目录是否存在
    if not os.path.isdir(MEMORY_DIR):
        logging.warning(f"记忆目录 '{MEMORY_DIR}' 不存在，跳过迁移。")
        return

    # 3. 遍历目录中的所有文件
    migrated_files = 0
    total_memories_added = 0
    for filename in os.listdir(MEMORY_DIR):
        if filename.endswith(".md"):
            file_path = os.path.join(MEMORY_DIR, filename)
            logging.info(f"正在处理文件: {file_path}")
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    lines_added = 0
                    for line in f:
                        # 清理空白行和可能的格式化字符
                        cleaned_line = line.strip()
                        
                        # 忽略空行或纯粹的格式行
                        if cleaned_line and not cleaned_line.startswith(('#', '---', '***')):
                            # 添加记忆，赋予较低的默认重要性，并标记来源
                            manager.add_memory(
                                text=cleaned_line,
                                category="migrated_daily_log",
                                importance=0.5,
                                source=f"daily_log:{filename}"
                            )
                            lines_added += 1
                    
                    if lines_added > 0:
                        logging.info(f"从 {filename} 添加了 {lines_added} 条记忆。")
                        total_memories_added += lines_added
                        migrated_files += 1

            except Exception as e:
                logging.error(f"处理文件 {filename} 时发生错误: {e}")

    logging.info("--- 每日记忆文件迁移完成 ---")
    logging.info(f"总共处理了 {migrated_files} 个文件。")
    logging.info(f"总共添加了 {total_memories_added} 条新记忆。")

if __name__ == "__main__":
    migrate_daily_logs()
