import lancedb
try:
    db = lancedb.connect("/Users/mac/.openclaw/workspace/lancedb_data")
    tbl = db.open_table("structured_memory")
    # Fetch using arrow directly
    ds = tbl.to_arrow()
    records = ds.to_pylist()
    print(f"========= TOTAL RECORDS: {len(records)} =========")
    for i, row in enumerate(records):
        print(f"--- Record {i+1} ---")
        print(f"[{row.get('created_at', '')}]")
        print(row.get('text', 'No Text'))
except Exception as e:
    import traceback
    print(f"Error: {e}")
    traceback.print_exc()
