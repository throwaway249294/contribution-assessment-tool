
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
    res.json({
        message: "Backend is running",
        database: mongoose.connection.readyState === 1
            ? "Connected"
            : "Disconnected"
    });
});

async function getCollection(req, res, collectionName) {
    try {
        const records = await mongoose.connection.db
            .collection(collectionName)
            .find({})
            .toArray();

        res.json(records);
    } catch (error) {
        console.error(
            `Error retrieving ${collectionName}:`,
            error.message
        );

        res.status(500).json({
            message: `Failed to retrieve ${collectionName}`
        });
    }
}

app.get("/api/teams", async (req, res) => {
    await getCollection(req, res, "teams");
});

app.get("/api/assessments", async (req, res) => {
    await getCollection(req, res, "assessments");
});

app.get("/api/evaluations", async (req, res) => {
    await getCollection(req, res, "evaluations");
});

app.get("/api/documents", async (req, res) => {
    await getCollection(req, res, "documents");
});

app.get("/api/weight-profiles", async (req, res) => {
    await getCollection(req, res, "weight_profiles");
});

app.get("/api/teachers", async (req, res) => {
    await getCollection(req, res, "teachers");
});

app.get("/api/audit-logs", async (req, res) => {
    await getCollection(req, res, "audit_logs");
});

app.post("/api/assessments", async (req, res) => {
    const { teamId, sprint, metricWeights } = req.body || {};
    if (!mongoose.isValidObjectId(teamId) ||
        !Number.isInteger(sprint) || sprint < 1 || sprint > 999) {
        return res.status(400).json({ message: "Select a valid team and sprint number (1–999)." });
    }
    try {
        const db = mongoose.connection.db;
        const team = await db.collection("teams").findOne({
            _id: new mongoose.Types.ObjectId(teamId)
        });
        if (!team) return res.status(404).json({ message: "Team not found." });
        const existing = await db.collection("assessments").findOne({
            teamId: team._id, sprint
        });
        if (existing) return res.status(409).json({
            message: "An assessment already exists for this team and sprint."
        });
        const weights = metricWeights || {
            taskCompletion: 25, collaboration: 25,
            contributionQuality: 25, evidenceTraceability: 25
        };
        const keys = Object.keys(weights);
        const expected = ["taskCompletion", "collaboration", "contributionQuality", "evidenceTraceability"];
        if (keys.length !== expected.length ||
            !expected.every(key => Object.hasOwn(weights, key)) ||
            Object.values(weights).some(value => !Number.isInteger(value) || value < 0 || value > 100) ||
            Object.values(weights).reduce((sum, value) => sum + value, 0) !== 100) {
            return res.status(400).json({ message: "Four valid assessment metric weights totalling 100 are required." });
        }
        const assessment = {
            teamId: team._id,
            unitCode: team.unitCode,
            sprint,
            status: "draft",
            metricWeights: weights,
            documentIds: [],
            flaggedMembers: 0,
            teacherConfirmed: false,
            createdAt: new Date()
        };
        const result = await db.collection("assessments").insertOne(assessment);
        res.status(201).json({ ...assessment, _id: result.insertedId });
    } catch (error) {
        console.error("Assessment creation failed:", error.message);
        res.status(500).json({ message: "Failed to create assessment." });
    }
});

app.post("/api/assessments/:id/evaluations", async (req, res) => {
    const { memberId, recommendation, evidenceNotes } = req.body || {};
    if (!mongoose.isValidObjectId(req.params.id) ||
        typeof memberId !== "string" || !memberId.trim() ||
        typeof recommendation !== "string" || !recommendation.trim() ||
        recommendation.length > 5000 ||
        typeof evidenceNotes !== "string" || evidenceNotes.length > 5000) {
        return res.status(400).json({ message: "A valid assessment, member, recommendation and evidence notes are required." });
    }
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const db = mongoose.connection.db;
            const assessment = await db.collection("assessments").findOne(
                { _id: new mongoose.Types.ObjectId(req.params.id) }, { session }
            );
            if (!assessment) throw Object.assign(new Error("Assessment not found."), { statusCode: 404 });
            if (assessment.teacherConfirmed) throw Object.assign(new Error("Confirmed assessments are locked."), { statusCode: 409 });
            const team = await db.collection("teams").findOne(
                { _id: new mongoose.Types.ObjectId(String(assessment.teamId)) }, { session }
            );
            if (!team?.members?.some(m => String(m.memberId) === memberId) || !team.teacherId) {
                throw Object.assign(new Error("Member does not belong to the assessment team."), { statusCode: 400 });
            }
            const existing = await db.collection("evaluations").findOne(
                { assessmentId: assessment._id, memberId }, { session }
            );
            if (existing) throw Object.assign(new Error("This member already has an evaluation."), { statusCode: 409 });
            const now = new Date();
            const evaluation = {
                assessmentId: assessment._id,
                memberId,
                status: "needs_review",
                evidence: { verified: [], unverified: [], unclaimed: [], peerFeedback: [] },
                aiRecommendation: null,
                teacherDecision: {
                    recommendation: recommendation.trim(),
                    reviewed: false,
                    reviewedAt: null,
                    evidenceNotes: evidenceNotes.trim()
                },
                source: "manual_teacher_entry",
                createdAt: now
            };
            const insert = await db.collection("evaluations").insertOne(evaluation, { session });
            await db.collection("audit_logs").insertOne({
                assessmentId: assessment._id,
                evaluationId: insert.insertedId,
                teacherId: team.teacherId,
                action: "manual_evaluation_created",
                fieldChanged: "teacherDecision.recommendation",
                previousValue: null,
                newValue: recommendation.trim(),
                reason: evidenceNotes.trim(),
                createdAt: now
            }, { session });
            result = { ...evaluation, _id: insert.insertedId };
        });
        res.status(201).json(result);
    } catch (error) {
        console.error("Manual evaluation creation failed:", error.message);
        res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Could not create evaluation."
        });
    } finally { await session.endSession(); }
});

app.patch("/api/evaluations/:id/review", async (req, res) => {
    const id = req.params.id;
    const { reviewed } = req.body || {};
    if (!mongoose.isValidObjectId(id) || typeof reviewed !== "boolean") {
        return res.status(400).json({ message: "Valid evaluation ID and reviewed boolean required." });
    }
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const db = mongoose.connection.db;
            const evaluation = await db.collection("evaluations").findOne(
                { _id: new mongoose.Types.ObjectId(id) }, { session }
            );
            if (!evaluation) throw Object.assign(new Error("Evaluation not found"), { statusCode: 404 });
            const assessment = await db.collection("assessments").findOne(
                { _id: new mongoose.Types.ObjectId(String(evaluation.assessmentId)) }, { session }
            );
            if (!assessment) throw Object.assign(new Error("Assessment not found"), { statusCode: 404 });
            if (assessment.teacherConfirmed) throw Object.assign(
                new Error("Confirmed assessments cannot be edited."), { statusCode: 409 }
            );
            const team = await db.collection("teams").findOne(
                { _id: new mongoose.Types.ObjectId(String(assessment.teamId)) }, { session }
            );
            if (!team?.teacherId) throw Object.assign(new Error("Team teacher not found"), { statusCode: 409 });
            const previousValue = evaluation.teacherDecision?.reviewed === true;
            const teacherDecision = {
                ...(evaluation.teacherDecision || {}),
                reviewed,
                reviewedAt: reviewed ? new Date() : null
            };
            await db.collection("evaluations").updateOne(
                { _id: evaluation._id }, { $set: { teacherDecision } }, { session }
            );
            await db.collection("audit_logs").insertOne({
                assessmentId: assessment._id, evaluationId: evaluation._id,
                teacherId: team.teacherId, action: "evaluation_review_updated",
                fieldChanged: "teacherDecision.reviewed", previousValue,
                newValue: reviewed, reason: "", createdAt: new Date()
            }, { session });
            result = { evaluationId: id, reviewed };
        });
        res.json(result);
    } catch (error) {
        console.error("Evaluation review failed:", error.message);
        res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Could not save review."
        });
    } finally { await session.endSession(); }
});

app.patch("/api/assessments/:id/confirm", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id) || req.body?.confirmed !== true) {
        return res.status(400).json({ message: "Valid assessment ID and explicit confirmation required." });
    }
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            const db = mongoose.connection.db;
            const assessment = await db.collection("assessments").findOne(
                { _id: new mongoose.Types.ObjectId(req.params.id) }, { session }
            );
            if (!assessment) throw Object.assign(new Error("Assessment not found"), { statusCode: 404 });
            if (assessment.teacherConfirmed) throw Object.assign(new Error("Already confirmed"), { statusCode: 409 });
            const team = await db.collection("teams").findOne(
                { _id: new mongoose.Types.ObjectId(String(assessment.teamId)) }, { session }
            );
            if (!team?.teacherId || !Array.isArray(team.members) || !team.members.length) {
                throw Object.assign(new Error("Team members or teacher are missing"), { statusCode: 409 });
            }
            const evaluations = await db.collection("evaluations").find(
                { assessmentId: assessment._id }, { session }
            ).toArray();
            const memberIds = team.members.map(member => String(member.memberId));
            const counts = new Map();
            for (const evaluation of evaluations) {
                const key = String(evaluation.memberId);
                counts.set(key, (counts.get(key) || 0) + 1);
            }
            const incomplete = memberIds.filter(id => counts.get(id) !== 1 ||
                !evaluations.some(e => String(e.memberId) === id &&
                    e.teacherDecision?.reviewed === true));
            if (incomplete.length || evaluations.length !== memberIds.length) {
                throw Object.assign(new Error(
                    "Every team member must have exactly one evaluation marked reviewed before confirmation. Missing or unreviewed: " +
                    (incomplete.join(", ") || "unexpected evaluation records")
                ), { statusCode: 409 });
            }
            const now = new Date();
            await db.collection("assessments").updateOne(
                { _id: assessment._id },
                { $set: { teacherConfirmed: true, status: "confirmed", confirmedAt: now } },
                { session }
            );
            await db.collection("audit_logs").insertOne({
                assessmentId: assessment._id, evaluationId: null,
                teacherId: team.teacherId, action: "assessment_confirmed",
                fieldChanged: "teacherConfirmed", previousValue: false,
                newValue: true, reason: "", createdAt: now
            }, { session });
            result = { assessmentId: req.params.id, teacherConfirmed: true, status: "confirmed" };
        });
        res.json(result);
    } catch (error) {
        console.error("Assessment confirmation failed:", error.message);
        res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Could not confirm assessment."
        });
    } finally { await session.endSession(); }
});

app.patch("/api/evaluations/:id/decision", async (req, res) => {
    const evaluationId = req.params.id;
    const recommendation = req.body?.recommendation;
    const reason = req.body?.reason;

    if (!mongoose.isValidObjectId(evaluationId)) {
        return res.status(400).json({ message: "Invalid evaluation ID" });
    }

    if (typeof recommendation !== "string" ||
        !recommendation.trim() ||
        recommendation.length > 5000) {
        return res.status(400).json({
            message: "Recommendation must contain 1 to 5000 characters"
        });
    }

    if (reason !== undefined &&
        (typeof reason !== "string" || reason.length > 1000)) {
        return res.status(400).json({ message: "Invalid reason" });
    }

    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            const database = mongoose.connection.db;
            const evaluations = database.collection("evaluations");
            const logs = database.collection("audit_logs");

            const evaluation = await evaluations.findOne(
                { _id: new mongoose.Types.ObjectId(evaluationId) },
                { session }
            );

            if (!evaluation) {
                const error = new Error("Evaluation not found");
                error.statusCode = 404;
                throw error;
            }

            const assessment = await database.collection("assessments").findOne(
                { _id: new mongoose.Types.ObjectId(String(evaluation.assessmentId)) },
                { session }
            );

            if (!assessment) {
                const error = new Error("Assessment not found");
                error.statusCode = 404;
                throw error;
            }

            if (assessment.teacherConfirmed) {
                throw Object.assign(new Error("Confirmed assessments cannot be edited."), { statusCode: 409 });
            }

            const team = await database.collection("teams").findOne(
                { _id: new mongoose.Types.ObjectId(String(assessment.teamId)) },
                { session }
            );

            if (!team?.teacherId) {
                const error = new Error("Teacher association not found");
                error.statusCode = 409;
                throw error;
            }

            const previousValue = evaluation.teacherDecision?.recommendation ?? null;
            const newValue = recommendation.trim();
            const now = new Date();

            const teacherDecision = {
                ...(evaluation.teacherDecision || {}),
                recommendation: newValue,
                updatedAt: now
            };

            await evaluations.updateOne(
                { _id: evaluation._id },
                { $set: { teacherDecision } },
                { session }
            );

            await logs.insertOne({
                assessmentId: evaluation.assessmentId,
                evaluationId: evaluation._id,
                teacherId: team.teacherId,
                action: "recommendation_updated",
                fieldChanged: "teacherDecision.recommendation",
                previousValue,
                newValue,
                reason: typeof reason === "string" ? reason.trim() : "",
                createdAt: now
            }, { session });

            result = {
                evaluationId: String(evaluation._id),
                recommendation: newValue,
                updatedAt: now
            };
        });

        res.json(result);
    } catch (error) {
        console.error("Failed to save evaluation decision:", error.message);
        res.status(error.statusCode || 500).json({
            message: error.statusCode
                ? error.message
                : "Failed to save evaluation decision"
        });
    } finally {
        await session.endSession();
    }
});

app.post("/api/weight-profiles", async (req, res) => {
    const { teamId, profileName, metrics } = req.body || {};
    const required = ["taskCompletion", "collaboration", "contributionQuality", "evidenceTraceability"];
    if (!mongoose.isValidObjectId(teamId) || typeof profileName !== "string" ||
        !profileName.trim() || profileName.trim().length > 100 ||
        !metrics || typeof metrics !== "object" || Array.isArray(metrics) ||
        Object.keys(metrics).length !== required.length ||
        !required.every(key => Object.hasOwn(metrics, key)) ||
        Object.values(metrics).some(value => !Number.isInteger(value) || value < 0 || value > 100) ||
        Object.values(metrics).reduce((sum, value) => sum + value, 0) !== 100) {
        return res.status(400).json({ message: "Valid team, profile name and four weights totalling 100 are required." });
    }
    try {
        const db = mongoose.connection.db;
        const team = await db.collection("teams").findOne({ _id: new mongoose.Types.ObjectId(teamId) });
        if (!team?.teacherId || !team.unitCode) {
            return res.status(404).json({ message: "Team, teacher or unit not found." });
        }
        const profileNameClean = profileName.trim();
        const existing = await db.collection("weight_profiles").findOne({
            teacherId: team.teacherId, unitCode: team.unitCode, profileName: profileNameClean
        });
        if (existing) return res.status(409).json({ message: "A profile with this name already exists for this educator and unit." });
        const profile = {
            teacherId: team.teacherId, unitCode: team.unitCode,
            profileName: profileNameClean, metrics,
            totalWeight: 100, isDefault: false, createdAt: new Date()
        };
        const inserted = await db.collection("weight_profiles").insertOne(profile);
        res.status(201).json({ ...profile, _id: inserted.insertedId });
    } catch (error) {
        console.error("Weight profile creation failed:", error.message);
        res.status(500).json({ message: "Could not create weight profile." });
    }
});

app.patch("/api/assessments/:id/weights", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ message: "Invalid assessment ID" });
    }

    const weights = req.body?.metricWeights;

    if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
        return res.status(400).json({ message: "metricWeights must be an object" });
    }

    const values = Object.values(weights);
    const keys = Object.keys(weights);

    if (keys.length === 0 || keys.length > 20 ||
        keys.some(key => !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(key)) ||
        values.some(value => !Number.isInteger(value) || value < 0 || value > 100) ||
        values.reduce((sum, value) => sum + value, 0) !== 100) {
        return res.status(400).json({
            message: "Weights must be whole percentages between 0 and 100, totalling 100"
        });
    }

    const session = await mongoose.startSession();

    try {
        let result;

        await session.withTransaction(async () => {
            const db = mongoose.connection.db;
            const assessments = db.collection("assessments");
            const id = new mongoose.Types.ObjectId(req.params.id);
            const assessment = await assessments.findOne({ _id: id }, { session });

            if (!assessment) {
                const error = new Error("Assessment not found");
                error.statusCode = 404;
                throw error;
            }

            if (assessment.teacherConfirmed) {
                throw Object.assign(new Error("Confirmed assessments cannot be edited."), { statusCode: 409 });
            }

            const existingKeys = Object.keys(assessment.metricWeights || {}).sort();
            const incomingKeys = [...keys].sort();

            if (JSON.stringify(existingKeys) !== JSON.stringify(incomingKeys)) {
                const error = new Error(
                    "Metric keys must match the assessment's existing database metrics"
                );
                error.statusCode = 400;
                throw error;
            }

            const team = await db.collection("teams").findOne(
                { _id: new mongoose.Types.ObjectId(String(assessment.teamId)) },
                { session }
            );

            if (!team?.teacherId) {
                const error = new Error("Teacher association not found");
                error.statusCode = 409;
                throw error;
            }

            await assessments.updateOne(
                { _id: id },
                { $set: { metricWeights: weights } },
                { session }
            );

            await db.collection("audit_logs").insertOne({
                assessmentId: id,
                evaluationId: null,
                teacherId: team.teacherId,
                action: "assessment_weights_updated",
                fieldChanged: "metricWeights",
                previousValue: assessment.metricWeights || {},
                newValue: weights,
                reason: "",
                createdAt: new Date()
            }, { session });

            result = { assessmentId: req.params.id, metricWeights: weights };
        });

        res.json(result);
    } catch (error) {
        console.error("Failed to save metric weights:", error.message);
        res.status(error.statusCode || 500).json({
            message: error.statusCode ? error.message : "Failed to save metric weights"
        });
    } finally {
        await session.endSession();
    }
});

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log("Connected to MongoDB");

        const collections = await mongoose.connection.db
            .listCollections()
            .toArray();

        console.log("MongoDB Collections:");

        collections.forEach((collection) => {
            console.log(collection.name);
        });

        app.listen(PORT, () => {
            console.log(`Backend running on port ${PORT}`);
        });
    } catch (error) {
        console.error(
            "MongoDB connection failed:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
