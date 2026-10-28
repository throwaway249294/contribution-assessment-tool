const UNIT = "COS40005";
const TEACHER_ID = "demo-teacher";
const DEFAULT_WEIGHTS = {
    taskCompletion: 25,
    collaboration: 25,
    contributionQuality: 25,
    evidenceTraceability: 25,
};
const METRIC_KEYS = Object.keys(DEFAULT_WEIGHTS);

const PROFILES = [
    {
        verified: [
            "Implemented the assessment dashboard and its filtering controls (18 commits, pull request #42 reviewed and merged)",
            "Connected the dashboard to the assessment API, with error handling and integration tests",
        ],
        unverified: [
            "Led the final deployment — changes were made under a shared automation account",
        ],
        unclaimed: [
            "Keyboard focus and table navigation fixes (7 commits) not mentioned in the report",
        ],
        peerFeedback: ["Two peers credit frontend coordination and code reviews"],
        summary:
            "Repository history supports consistent frontend work, and peer feedback agrees. One deployment claim cannot be attributed from the repository and needs clarification before confirming.",
        flag: null,
    },
    {
        verified: [
            "Built the service that retrieves commits and pull request metadata (16 commits, pull request #37)",
            "Added issue activity to the evidence pipeline",
        ],
        unverified: [
            "Designed the complete data collection architecture — the design document lists several authors",
        ],
        unclaimed: [],
        peerFeedback: ["Three peers describe help during API integration and debugging"],
        summary:
            "Balanced contribution to repository integration. Most claims are supported; the architecture claim should be checked against the design document's revision history.",
        flag: null,
    },
    {
        verified: [
            "Built the password recovery screens and email token handler (184 of 211 lines authored)",
        ],
        unverified: ["Led the schema design — no commits to schema files under this identity"],
        unclaimed: [
            "Test suite for the authentication module: 9 commits, 14 test cases, not mentioned in any document",
        ],
        peerFeedback: [
            "Three of five peers credit this member with design direction and unblocking others",
        ],
        summary:
            "Below the team on repository evidence, but peers credit design and support work that leaves no commit trace. The gap between the evidence streams is the finding here. Review alongside the sprint retrospective before adjusting any mark.",
        flag: "Below range",
    },
    {
        verified: [
            "Implemented PDF and DOCX text extraction (15 commits, pull request #51)",
            "Built text clean-up and section splitting for claim extraction",
        ],
        unverified: ["Reduced document processing time by 40% — no benchmark in the repository"],
        unclaimed: ["Wrote a parser troubleshooting guide with sample failure cases"],
        peerFeedback: ["Peers highlight thorough testing of document formats"],
        summary:
            "Sustained work on document processing is well supported. The performance claim needs a reproducible benchmark before it can be credited.",
        flag: null,
    },
    {
        verified: [
            "Implemented database tables and migration scripts (21 commits, pull request #33)",
            "Implemented weighted scoring and threshold checks, with boundary tests",
        ],
        unverified: [],
        unclaimed: ["Deployment rollback scripts and a recovery checklist (6 commits)"],
        peerFeedback: [
            "Four of five peers mention organising integration meetings and reviewing blocked pull requests",
        ],
        summary:
            "Largest share of repository evidence, with strong support from peers. Above range is a prompt to review, not evidence of a problem or a reason to reduce credit.",
        flag: "Above range",
    },
    {
        verified: [
            "Tested the educator workflow and fixed interface regressions (10 commits, issues #68 and #72 closed)",
        ],
        unverified: [
            "Implemented the recommendation generation algorithm — the main files were authored by another member",
            "Built the repository authentication module — this member reviewed the pull request rather than authoring it",
        ],
        unclaimed: ["Error message accessibility fixes (5 commits)"],
        peerFeedback: ["Peers credit accessibility testing and detailed feedback"],
        summary:
            "Low repository share, but verified testing and accessibility work shows this is not an absence of contribution. Review pairing records and the unverified claims before confirming.",
        flag: "Below range",
    },
];

const NAMES = [
    "Alex Rivera",
    "Sam Okafor",
    "Priya Nair",
    "Jordan Lee",
    "Mia Kowalski",
    "Tom Hughes",
    "Ella Brooks",
    "Noah Tan",
    "Zara Ahmed",
    "Leo Martin",
    "Ruby Chen",
    "Owen Price",
    "Isla Grant",
    "Kai Morgan",
    "Lily Evans",
    "Finn Walsh",
    "Ava Russo",
    "Max Dunn",
    "Hana Sato",
    "Ben Clarke",
];

function makeTeam(id, teamName, size, offset, missingGithub = []) {
    return {
        _id: id,
        teamName,
        unitCode: UNIT,
        teacherId: TEACHER_ID,
        members: Array.from({ length: size }, (_, i) => {
            const name = NAMES[offset + i];
            return {
                memberId: `${id}-m${i + 1}`,
                name,
                role: "Student",
                githubUsername: missingGithub.includes(i)
                    ? ""
                    : name.toLowerCase().replace(" ", "-") + "-demo",
            };
        }),
    };
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
let counter = 0;
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

function sampleEvaluation(
    assessmentId,
    memberId,
    profileIndex,
    { reviewed = false, recommendation, createdAt } = {},
) {
    const p = PROFILES[profileIndex % PROFILES.length];
    return {
        _id: newId("eval"),
        assessmentId,
        memberId,
        status: "needs_review",
        flag: p.flag,
        evidence: {
            verified: p.verified,
            unverified: p.unverified,
            unclaimed: p.unclaimed,
            peerFeedback: p.peerFeedback,
        },
        aiRecommendation: { summary: p.summary },
        teacherDecision: { recommendation, reviewed, reviewedAt: reviewed ? createdAt : null },
        source: "demo_sample",
        createdAt,
    };
}

function seed() {
    const teams = [
        makeTeam("team-04", "Team 04", 6, 0),
        makeTeam("team-11", "Team 11", 5, 6),
        makeTeam("team-07", "Team 07", 5, 11),
        makeTeam("team-09", "Team 09", 4, 16, [2]),
    ];
    const assessments = [];
    const evaluations = [];
    const logs = [];
    const log = (entry) =>
        logs.push({ _id: newId("log"), teacherId: TEACHER_ID, reason: "", ...entry });

    const addAssessment = (
        id,
        team,
        sprint,
        created,
        { confirmed = false, weights = DEFAULT_WEIGHTS, skip = [], reviewedUpTo = 0 } = {},
    ) => {
        assessments.push({
            _id: id,
            teamId: team._id,
            unitCode: UNIT,
            sprint,
            status: confirmed ? "confirmed" : "needs_review",
            metricWeights: { ...weights },
            documentIds: [],
            flaggedMembers: 0,
            teacherConfirmed: confirmed,
            createdAt: daysAgo(created),
        });
        team.members.forEach((m, i) => {
            if (skip.includes(i)) return;
            const reviewed = confirmed || i < reviewedUpTo;
            const e = sampleEvaluation(id, m.memberId, i, {
                reviewed,
                createdAt: daysAgo(created),
            });
            evaluations.push(e);
            if (reviewed)
                log({
                    assessmentId: id,
                    evaluationId: e._id,
                    action: "evaluation_review_updated",
                    fieldChanged: "teacherDecision.reviewed",
                    previousValue: false,
                    newValue: true,
                    createdAt: daysAgo(created - 0.2),
                });
        });
        if (confirmed)
            log({
                assessmentId: id,
                evaluationId: null,
                action: "assessment_confirmed",
                fieldChanged: "teacherConfirmed",
                previousValue: false,
                newValue: true,
                createdAt: daysAgo(created - 0.3),
            });
    };

    const [t04, t11, t07] = teams;
    addAssessment("asmt-t04-s2", t04, 2, 24, { confirmed: true });
    addAssessment("asmt-t11-s3", t11, 3, 6, { confirmed: true });
    addAssessment("asmt-t07-s3", t07, 3, 5, { skip: [3] });
    addAssessment("asmt-t04-s3", t04, 3, 4, {
        weights: {
            taskCompletion: 30,
            collaboration: 25,
            contributionQuality: 25,
            evidenceTraceability: 20,
        },
        reviewedUpTo: 2,
    });

    log({
        assessmentId: "asmt-t04-s3",
        evaluationId: null,
        action: "assessment_weights_updated",
        fieldChanged: "metricWeights",
        previousValue: { ...DEFAULT_WEIGHTS },
        newValue: {
            taskCompletion: 30,
            collaboration: 25,
            contributionQuality: 25,
            evidenceTraceability: 20,
        },
        createdAt: daysAgo(3.9),
    });
    const edited = evaluations.find(
        (e) => e.assessmentId === "asmt-t04-s3" && e.memberId === "team-04-m1",
    );
    const before = edited.aiRecommendation.summary;
    edited.teacherDecision.recommendation =
        "Strong, consistent frontend work. Deployment claim confirmed with the team in the sprint retrospective.";
    log({
        assessmentId: "asmt-t04-s3",
        evaluationId: edited._id,
        action: "recommendation_updated",
        fieldChanged: "teacherDecision.recommendation",
        previousValue: before,
        newValue: edited.teacherDecision.recommendation,
        reason: "Retrospective notes confirm this member ran the deployment.",
        createdAt: daysAgo(3.5),
    });

    const weightProfiles = [
        {
            _id: "profile-equal",
            teacherId: TEACHER_ID,
            unitCode: UNIT,
            profileName: "Equal weighting",
            metrics: { ...DEFAULT_WEIGHTS },
            totalWeight: 100,
            isDefault: true,
            createdAt: daysAgo(30),
        },
        {
            _id: "profile-delivery",
            teacherId: TEACHER_ID,
            unitCode: UNIT,
            profileName: "Delivery focus",
            metrics: {
                taskCompletion: 40,
                collaboration: 20,
                contributionQuality: 25,
                evidenceTraceability: 15,
            },
            totalWeight: 100,
            isDefault: false,
            createdAt: daysAgo(20),
        },
    ];
    const teachers = [
        {
            _id: TEACHER_ID,
            name: "Dr Casey Morgan (demo)",
            email: "c.morgan@example.edu",
            role: "Unit convenor",
        },
    ];
    return {
        teams,
        assessments,
        evaluations,
        "audit-logs": logs,
        "weight-profiles": weightProfiles,
        teachers,
        documents: [],
    };
}

const db = seed();

const ok = (data, status = 200) => [status, data];
const fail = (status, message) => [status, { message }];
const validWeights = (w, keys = METRIC_KEYS) =>
    w &&
    typeof w === "object" &&
    !Array.isArray(w) &&
    Object.keys(w).length === keys.length &&
    keys.every((k) => Object.hasOwn(w, k)) &&
    Object.values(w).every((v) => Number.isInteger(v) && v >= 0 && v <= 100) &&
    Object.values(w).reduce((s, v) => s + v, 0) === 100;
const now = () => new Date().toISOString();
const teamOf = (assessment) => db.teams.find((t) => t._id === assessment.teamId);
const log = (entry) =>
    db["audit-logs"].push({
        _id: newId("log"),
        teacherId: TEACHER_ID,
        reason: "",
        createdAt: now(),
        ...entry,
    });

function route(method, path, body = {}) {
    const parts = path.split("/").map(decodeURIComponent);

    if (method === "GET" && db[path]) return ok(clone(db[path]));

    if (method === "POST" && path === "assessments") {
        const { teamId, sprint, metricWeights } = body;
        if (!Number.isInteger(sprint) || sprint < 1 || sprint > 999)
            return fail(400, "Select a valid team and sprint number (1–999).");
        const team = db.teams.find((t) => t._id === teamId);
        if (!team) return fail(404, "Team not found.");
        if (db.assessments.some((a) => a.teamId === teamId && a.sprint === sprint))
            return fail(409, "An assessment already exists for this team and sprint.");
        const weights = metricWeights || { ...DEFAULT_WEIGHTS };
        if (!validWeights(weights))
            return fail(400, "Four valid assessment metric weights totalling 100 are required.");
        const assessment = {
            _id: newId("asmt"),
            teamId,
            unitCode: team.unitCode,
            sprint,
            status: "needs_review",
            metricWeights: weights,
            documentIds: [],
            flaggedMembers: 0,
            teacherConfirmed: false,
            createdAt: now(),
        };
        db.assessments.push(assessment);
        team.members.forEach((m, i) =>
            db.evaluations.push(
                sampleEvaluation(assessment._id, m.memberId, i + sprint, { createdAt: now() }),
            ),
        );
        return ok(clone(assessment), 201);
    }

    if (method === "POST" && parts[0] === "assessments" && parts[2] === "evaluations") {
        const { memberId, recommendation, evidenceNotes } = body;
        if (
            typeof memberId !== "string" ||
            !memberId.trim() ||
            typeof recommendation !== "string" ||
            !recommendation.trim() ||
            recommendation.length > 5000 ||
            typeof evidenceNotes !== "string" ||
            evidenceNotes.length > 5000
        )
            return fail(
                400,
                "A valid assessment, member, recommendation and evidence notes are required.",
            );
        const assessment = db.assessments.find((a) => a._id === parts[1]);
        if (!assessment) return fail(404, "Assessment not found.");
        if (assessment.teacherConfirmed) return fail(409, "Confirmed assessments are locked.");
        if (!teamOf(assessment)?.members.some((m) => m.memberId === memberId))
            return fail(400, "Member does not belong to the assessment team.");
        if (
            db.evaluations.some((e) => e.assessmentId === assessment._id && e.memberId === memberId)
        )
            return fail(409, "This member already has an evaluation.");
        const evaluation = {
            _id: newId("eval"),
            assessmentId: assessment._id,
            memberId,
            status: "needs_review",
            evidence: { verified: [], unverified: [], unclaimed: [], peerFeedback: [] },
            aiRecommendation: null,
            teacherDecision: {
                recommendation: recommendation.trim(),
                reviewed: false,
                reviewedAt: null,
                evidenceNotes: evidenceNotes.trim(),
            },
            source: "manual_teacher_entry",
            createdAt: now(),
        };
        db.evaluations.push(evaluation);
        log({
            assessmentId: assessment._id,
            evaluationId: evaluation._id,
            action: "manual_evaluation_created",
            fieldChanged: "teacherDecision.recommendation",
            previousValue: null,
            newValue: recommendation.trim(),
            reason: evidenceNotes.trim(),
        });
        return ok(clone(evaluation), 201);
    }

    if (
        method === "PATCH" &&
        parts[0] === "evaluations" &&
        (parts[2] === "review" || parts[2] === "decision")
    ) {
        const evaluation = db.evaluations.find((e) => e._id === parts[1]);
        if (parts[2] === "review" && typeof body.reviewed !== "boolean")
            return fail(400, "Valid evaluation ID and reviewed boolean required.");
        if (parts[2] === "decision") {
            if (
                typeof body.recommendation !== "string" ||
                !body.recommendation.trim() ||
                body.recommendation.length > 5000
            )
                return fail(400, "Recommendation must contain 1 to 5000 characters");
            if (
                body.reason !== undefined &&
                (typeof body.reason !== "string" || body.reason.length > 1000)
            )
                return fail(400, "Invalid reason");
        }
        if (!evaluation) return fail(404, "Evaluation not found");
        const assessment = db.assessments.find((a) => a._id === evaluation.assessmentId);
        if (assessment.teacherConfirmed)
            return fail(409, "Confirmed assessments cannot be edited.");
        if (parts[2] === "review") {
            const previousValue = evaluation.teacherDecision?.reviewed === true;
            evaluation.teacherDecision = {
                ...(evaluation.teacherDecision || {}),
                reviewed: body.reviewed,
                reviewedAt: body.reviewed ? now() : null,
            };
            log({
                assessmentId: assessment._id,
                evaluationId: evaluation._id,
                action: "evaluation_review_updated",
                fieldChanged: "teacherDecision.reviewed",
                previousValue,
                newValue: body.reviewed,
            });
            return ok({ evaluationId: evaluation._id, reviewed: body.reviewed });
        }
        const previousValue = evaluation.teacherDecision?.recommendation ?? null;
        const newValue = body.recommendation.trim();
        evaluation.teacherDecision = {
            ...(evaluation.teacherDecision || {}),
            recommendation: newValue,
        };
        log({
            assessmentId: assessment._id,
            evaluationId: evaluation._id,
            action: "recommendation_updated",
            fieldChanged: "teacherDecision.recommendation",
            previousValue,
            newValue,
            reason: typeof body.reason === "string" ? body.reason.trim() : "",
        });
        return ok({ evaluationId: evaluation._id, recommendation: newValue, updatedAt: now() });
    }

    if (method === "PATCH" && parts[0] === "assessments" && parts[2] === "confirm") {
        if (body.confirmed !== true)
            return fail(400, "Valid assessment ID and explicit confirmation required.");
        const assessment = db.assessments.find((a) => a._id === parts[1]);
        if (!assessment) return fail(404, "Assessment not found");
        if (assessment.teacherConfirmed) return fail(409, "Already confirmed");
        const evaluations = db.evaluations.filter((e) => e.assessmentId === assessment._id);
        const missing = teamOf(assessment).members.filter(
            (m) =>
                evaluations.filter((e) => e.memberId === m.memberId).length !== 1 ||
                !evaluations.some(
                    (e) => e.memberId === m.memberId && e.teacherDecision?.reviewed === true,
                ),
        );
        if (missing.length)
            return fail(
                409,
                "Every team member must have exactly one evaluation marked reviewed before confirmation. Missing or unreviewed: " +
                    missing.map((m) => m.name).join(", "),
            );
        Object.assign(assessment, {
            teacherConfirmed: true,
            status: "confirmed",
            confirmedAt: now(),
        });
        log({
            assessmentId: assessment._id,
            evaluationId: null,
            action: "assessment_confirmed",
            fieldChanged: "teacherConfirmed",
            previousValue: false,
            newValue: true,
        });
        return ok({ assessmentId: assessment._id, teacherConfirmed: true, status: "confirmed" });
    }

    if (method === "PATCH" && parts[0] === "assessments" && parts[2] === "weights") {
        const weights = body.metricWeights;
        if (!weights || typeof weights !== "object" || Array.isArray(weights))
            return fail(400, "metricWeights must be an object");
        const assessment = db.assessments.find((a) => a._id === parts[1]);
        if (!assessment) return fail(404, "Assessment not found");
        if (assessment.teacherConfirmed)
            return fail(409, "Confirmed assessments cannot be edited.");
        if (!validWeights(weights, Object.keys(assessment.metricWeights)))
            return fail(400, "Weights must be whole percentages between 0 and 100, totalling 100");
        const previousValue = { ...assessment.metricWeights };
        assessment.metricWeights = { ...weights };
        log({
            assessmentId: assessment._id,
            evaluationId: null,
            action: "assessment_weights_updated",
            fieldChanged: "metricWeights",
            previousValue,
            newValue: { ...weights },
        });
        return ok({ assessmentId: assessment._id, metricWeights: { ...weights } });
    }

    if (method === "POST" && path === "weight-profiles") {
        const { teamId, profileName, metrics } = body;
        if (
            typeof profileName !== "string" ||
            !profileName.trim() ||
            profileName.trim().length > 100 ||
            !validWeights(metrics)
        )
            return fail(
                400,
                "Valid team, profile name and four weights totalling 100 are required.",
            );
        const team = db.teams.find((t) => t._id === teamId);
        if (!team) return fail(404, "Team, teacher or unit not found.");
        if (
            db["weight-profiles"].some(
                (p) =>
                    p.teacherId === team.teacherId &&
                    p.unitCode === team.unitCode &&
                    p.profileName === profileName.trim(),
            )
        )
            return fail(409, "A profile with this name already exists for this educator and unit.");
        const profile = {
            _id: newId("profile"),
            teacherId: team.teacherId,
            unitCode: team.unitCode,
            profileName: profileName.trim(),
            metrics: { ...metrics },
            totalWeight: 100,
            isDefault: false,
            createdAt: now(),
        };
        db["weight-profiles"].push(profile);
        return ok(clone(profile), 201);
    }

    return fail(404, `Not available in demo mode: ${method} ${path}`);
}

export async function demoFetch(url, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const path = String(url).replace(/^.*?\/api\//, "");
    const body = options.body ? JSON.parse(options.body) : {};
    await new Promise((resolve) => setTimeout(resolve, 120));
    const [status, data] = route(method, path, body);
    return {
        ok: status < 400,
        status,
        json: async () => data,
        text: async () => JSON.stringify(data),
    };
}