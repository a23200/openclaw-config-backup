import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { assistPrd, generatePrd } from "../services/openai.js";

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1, "应用名称不能为空"),
  description: z.string().optional().default(""),
});

const updateProjectSchema = z.object({
  prd: z.string().min(1, "需求文档不能为空"),
});

const assistSchema = z.object({
  action: z.enum(["regenerate", "optimize", "add-feature"]),
  feature: z.string().optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const payload = createProjectSchema.parse(req.body);
    const prd = await generatePrd(payload.name, payload.description ?? "");

    const project = await prisma.project.create({
      data: {
        name: payload.name,
        description: payload.description,
        prd,
      },
    });

    res.status(201).json(project);
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!project) {
      res.status(404).json({ message: "项目不存在" });
      return;
    }

    res.json(project);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const payload = updateProjectSchema.parse(req.body);

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        prd: payload.prd,
      },
    });

    res.json(project);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/assist", async (req, res, next) => {
  try {
    const payload = assistSchema.parse(req.body);
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
    });

    if (!project) {
      res.status(404).json({ message: "项目不存在" });
      return;
    }

    const prd = await assistPrd(project.prd, payload.action, {
      appName: project.name,
      description: project.description,
      feature: payload.feature,
    });

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { prd },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
