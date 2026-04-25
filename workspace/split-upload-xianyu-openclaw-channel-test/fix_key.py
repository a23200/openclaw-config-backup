
import sqlite3
import os

def update_global_key():
    """
    Updates the global AI API key in the `system_settings` table.
    This is a workaround for a bug where the application ignores the per-account key.
    """
    db_path = 'data/xianyu_data.db'
    api_key = 'sk-ce917b590e0b4eaaad6418c1ef500ac8' # The user's correct key
    
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Use INSERT OR REPLACE to handle both cases (key exists or not)
        # This is simpler and more robust than UPDATE then INSERT.
        cursor.execute("""
            INSERT INTO system_settings (key, value) 
            VALUES ('ai_api_key', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value;
        """, (api_key,))
            
        conn.commit()
        print("Successfully forced the update of the global AI API key in 'system_settings'.")
        
    except Exception as e:
        print(f"An error occurred while updating the database: {str(e)}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    # Ensure the script runs in its own directory context
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    update_global_key()
