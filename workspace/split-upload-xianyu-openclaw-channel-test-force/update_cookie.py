import sqlite3
import sys

db_path = '/Users/mac/.openclaw/workspace/xianyu-openclaw-channel/data/xianyu_data.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

cookie_str = """cookie2=175b2c80d8b6a06d04223ff588c26ab3; mtop_partitioned_detect=1; _m_h5_tk=dde60837dc801d2ca66176861e2c75db_1775075117926; _m_h5_tk_enc=1ea58fe79824612e0fcc10f7facb3be9; cna=nkhUIsAjdk8CASeAFPgFJTZT; _samesite_flag_=true; t=38d9847e55177bbc58d6f6120c70ace9; _tb_token_=e13b373de133b; xlly_s=1; tracknick=%E8%B9%B2%E4%BD%A0%E5%9D%9F%E5%A4%B4%E5%94%B1high%E6%AD%8C; unb=3083424450; sgcookie=E100aj2pieCzk8QaW97IsTmQtIBvtZKdAuyZYE%2FLVh%2Bw6%2BXY7Uv6ypvFANhI6v40WKTdEBCujmWtuSJzNhGgiQm4Y25KsbW5wVrTDf91eiE%2F0rQ%3D; csg=e2909210; havana_lgc2_77=eyJoaWQiOjMwODM0MjQ0NTAsInNnIjoiOGE1ZjQ3NGJlMDA4NThjYzUxYzcxOGJkNjhiZjBiMTciLCJzaXRlIjo3NywidG9rZW4iOiIxTGZPbjJtM2dyLWxsVjBNQkVTOFk2dyJ9; _hvn_lgc_=77; havana_lgc_exp=1777657788516; sdkSilent=1775152190793; tfstk=gXWqOUYUHdb7dK4hYMvaaGFM4S9vBdzI7OT6jGjMcEYmhxgGawbJl11Xlc5PSadXoOStQhjGWoL_D7sADdpgRy1adiIAoUVkdz9gjgv6bxfGtesADdn8RywQdieZFNjCodbMEUxwxd0MjjqyEH-HIxAinb0kyhvMINvg4gYJjdxcSdqPqUKMIUhPSZHyzIq2faCFeOt2gejDrisfEnuB-iYrIAq60Ix5mUkiIT5itggp88ukPGjdsQWaHx9OV67NsaqiIF5kYw-Cl8D2I_bPLBj88xLVZZBwhBeZb35FqZWkQWovVtSlpCWYuYYVygfBH94-Qwj5AtdRQyukWstpEn5zjbYDsgWtW34b4OCqSfRD238Q4u5xMmm4iTgsjfh9a7KyRkEK6fdc438Q4ict6QmW4eZe3"""
cookie_id = "3083424450"

try:
    c.execute("DELETE FROM cookies")
    c.execute("INSERT INTO cookies (id, value, user_id) VALUES (?, ?, ?)", (cookie_id, cookie_str, 1))
    conn.commit()
    print("Database updated successfully.")
except Exception as e:
    print(f"Error: {e}")
finally:
    conn.close()
