import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import roomsRouter from "./rooms.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roomsRouter);

export default router;
