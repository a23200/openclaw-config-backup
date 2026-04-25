import { Router } from "express";
import { subscribeBuild } from "../lib/buildStore.js";
import { getBuildStatus, startBuild } from "../services/androidBuilder.js";

const router = Router();

router.post("/:id", async (req, res, next) => {
  try {
    await startBuild(req.params.id);
    res.status(202).json({
      projectId: req.params.id,
      message: "构建流程已启动",
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/status", async (req, res, next) => {
  try {
    const status = await getBuildStatus(req.params.id);
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.get("/:id/stream", async (req, res, next) => {
  try {
    const initialState = await getBuildStatus(req.params.id);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify(initialState)}\n\n`);

    const unsubscribe = subscribeBuild(req.params.id, (snapshot) => {
      res.write(`data: ${JSON.stringify(snapshot)}\n\n`);
    });

    const keepAlive = setInterval(() => {
      res.write(": ping\n\n");
    }, 15000);

    req.on("close", () => {
      clearInterval(keepAlive);
      unsubscribe();
      res.end();
    });
  } catch (error) {
    next(error);
  }
});

export default router;
