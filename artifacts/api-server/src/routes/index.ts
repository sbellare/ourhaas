import { Router, type IRouter } from "express";
import healthRouter from "./health";
import haasRouter from "./haas";

const router: IRouter = Router();

router.use(healthRouter);
router.use(haasRouter);

export default router;
