from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db import init_db
from app.routers import comments, douyin, health, leads, outreach, reports, videos


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


settings = get_settings()
app = FastAPI(title=settings.app_name, lifespan=lifespan)
static_dir = Path(__file__).parent / "static"

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(videos.router, prefix=settings.api_prefix)
app.include_router(comments.router, prefix=settings.api_prefix)
app.include_router(douyin.router, prefix=settings.api_prefix)
app.include_router(leads.router, prefix=settings.api_prefix)
app.include_router(outreach.router, prefix=settings.api_prefix)
app.include_router(reports.router, prefix=settings.api_prefix)
app.mount("/static", StaticFiles(directory=static_dir), name="static")


def asset_version() -> str:
    candidates = [static_dir / "app.css", static_dir / "app.js", static_dir / "index.html"]
    latest = max(path.stat().st_mtime_ns for path in candidates if path.exists())
    return str(latest)


@app.middleware("http")
async def disable_cache(request: Request, call_next):
    response = await call_next(request)
    if request.url.path == "/" or request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/", include_in_schema=False)
def dashboard() -> HTMLResponse:
    html = (static_dir / "index.html").read_text(encoding="utf-8")
    html = html.replace("__ASSET_VERSION__", asset_version())
    return HTMLResponse(html, headers={"Cache-Control": "no-store"})
