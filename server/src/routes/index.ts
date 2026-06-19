import { Router } from "express";
import { photosRouter } from "./photos";
import { jobsRouter, scanRouter } from "./jobs";
import { statsRouter } from "./stats";
import { foldersRouter } from "./folders";
import { tagsRouter } from "./tags";
import { duplicatesRouter } from "./duplicates";
import { renameRouter } from "./rename";
import { metadataRouter } from "./metadata";
import { organizeRouter } from "./organize";
import { countPhotos } from "../db/photos";
import { jobs } from "../jobs";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    photos: countPhotos(),
    scanRunning: jobs.isRunning("scan"),
  });
});

apiRouter.use("/photos", photosRouter);
apiRouter.use("/jobs", jobsRouter);
apiRouter.use("/scan", scanRouter);
apiRouter.use("/stats", statsRouter);
apiRouter.use("/folders", foldersRouter);
apiRouter.use("/tags", tagsRouter);
apiRouter.use("/duplicates", duplicatesRouter);
apiRouter.use("/rename", renameRouter);
apiRouter.use("/metadata", metadataRouter);
apiRouter.use("/organize", organizeRouter);
