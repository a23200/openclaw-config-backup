
import sqlite3
import os
import json

def get_first_enabled_ai_config():
    """
    Connects to the SQLite database, finds the first enabled account,
    and prints its AI configuration from the correct 'ai_reply_settings' table.
    """
    db_path = 'data/xianyu_data.db'
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Find the first enabled cookie_id
        # Get all cookies to determine order
        cursor.execute("SELECT id FROM cookies")
        all_cookie_ids = [row['id'] for row in cursor.fetchall()]
        
        # Get all statuses
        cursor.execute("SELECT cookie_id, enabled FROM cookie_status")
        statuses = {row['cookie_id']: row['enabled'] for row in cursor.fetchall()}

        enabled_cookie_id = None
        for cookie_id in all_cookie_ids:
            # Default to enabled (1) if not present in the status table
            if statuses.get(cookie_id, 1) == 1:
                enabled_cookie_id = cookie_id
                break
        
        if not enabled_cookie_id:
            print(json.dumps({"error": "No enabled cookies found in the database."}))
            return

        # Get AI config from the correct table: ai_reply_settings
        cursor.execute("SELECT * FROM ai_reply_settings WHERE cookie_id = ?", (enabled_cookie_id,))
        config_row = cursor.fetchone()
        
        if config_row and config_row['ai_enabled']:
            output = {
                'api_base': config_row['base_url'],
                'api_key': config_row['api_key'],
                'model_name': config_row['model_name'],
            }
            print(json.dumps(output))
        else:
            print(json.dumps({"error": f"AI reply is not enabled or not configured for the first active account ({enabled_cookie_id})."}))

    except Exception as e:
        print(json.dumps({"error": f"An error occurred while reading the database: {str(e)}"}))
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    # Ensure the script runs in its own directory context for relative path 'data/xianyu_data.db' to work
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    get_first_enabled_ai_config()
