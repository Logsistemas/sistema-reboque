import psycopg2

urls = [
    "postgresql://postgres:postgres@localhost:5432/postgres",
    "postgresql://postgres@localhost:5432/postgres",
]
for u in urls:
    try:
        c = psycopg2.connect(u)
        cur = c.cursor()
        cur.execute("select 1 from motoristas limit 1")
        print("OK", u)
        c.close()
    except Exception as e:
        print("FAIL", u, str(e)[:100])
