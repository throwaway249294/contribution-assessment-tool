const API_BASE = "http://localhost:5000/api";

async function readCollection(name) {
    const response = await fetch(`${API_BASE}/${name}`);

    if (!response.ok) {
        throw new Error(`Could not load ${name} (HTTP ${response.status})`);
    }

    const records = await response.json();

    if (!Array.isArray(records)) {
        throw new Error(`Unexpected response for ${name}`);
    }

    return records;
}

function evidenceText(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
        if (typeof item === "string") {
            return item;
        }

        return item?.claim || item?.description || item?.text || JSON.stringify(item);
    });
}

export async function loadAssessments() {
    const [teams, assessments, evaluations] = await Promise.all([
        readCollection("teams"),
        readCollection("assessments"),
        readCollection("evaluations")
    ]);

    const teamsById = new Map(teams.map((team) => [String(team._id), team]));

    return assessments.map((assessment) => {
        const team = teamsById.get(String(assessment.teamId));
        const teamName = team?.teamName || "Unknown team";
        const evaluationsByMember = new Map(
            evaluations
                .filter((evaluation) => String(evaluation.assessmentId) === String(assessment._id))
                .map((evaluation) => [String(evaluation.memberId), evaluation])
        );

        const members = (team?.members || []).map((person) => {
            const evaluation = evaluationsByMember.get(String(person.memberId));
            const evidence = evaluation?.evidence || {};

            return {
                id: person.memberId,
                evaluationId: evaluation?._id ? String(evaluation._id) : null,
                name: person.name || evaluation?.memberName || "Unnamed member",
                role: person.role || "",
                githubUsername: person.githubUsername || "",
                verified: evidenceText(evidence.verified),
                unverified: evidenceText(evidence.unverified),
                unclaimed: evidenceText(evidence.unclaimed),
                peer: evidenceText(evidence.peerFeedback),
                recommendation: evaluation?.teacherDecision?.recommendation
                    || evaluation?.aiRecommendation?.summary
                    || "No recommendation available.",
                evaluationStatus: evaluation?.status || "No evaluation",
                reviewed: evaluation?.teacherDecision?.reviewed === true
            };
        });

        return {
            id: String(assessment._id),
            teamId: assessment.teamId ? String(assessment.teamId) : "",
            sprintNumber: assessment.sprint ?? null,
            title: `${teamName} — Sprint ${assessment.sprint ?? "?"}`,
            unit: assessment.unitCode || team?.unitCode || "",
            team: teamName,
            sprint: `Sprint ${assessment.sprint ?? "?"}`,
            status: assessment.status || "Unknown",
            teacherConfirmed: assessment.teacherConfirmed === true,
            date: assessment.createdAt
                ? new Date(assessment.createdAt).toLocaleDateString()
                : "",
            members,
            metricWeights: assessment.metricWeights || {},
            isDatabaseRecord: true
        };
    });
}


export async function saveEvaluationDecision(evaluationId, recommendation) {
    const response = await fetch(
        `${API_BASE}/evaluations/${encodeURIComponent(evaluationId)}/decision`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recommendation })
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || "Failed to save recommendation");
    }

    return result;
}

export async function loadAuditLogs() {
    return readCollection("audit-logs");
}


export async function saveAssessmentWeights(assessmentId, metricWeights) {
    const response = await fetch(
        `${API_BASE}/assessments/${encodeURIComponent(assessmentId)}/weights`,
        {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metricWeights })
        }
    );

    const raw = await response.text();
    let result;

    try {
        result = JSON.parse(raw);
    } catch {
        throw new Error(`Backend returned non-JSON (HTTP ${response.status}). Check the backend version and port.`);
    }

    if (!response.ok) {
        throw new Error(result.message || "Could not save assessment weights");
    }

    return result;
}


export async function loadTeams() {
    return readCollection("teams");
}

export async function createAssessment({ teamId, sprint, metricWeights }) {
    const response = await fetch(`${API_BASE}/assessments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, sprint, metricWeights })
    });
    const raw = await response.text();
    let result;
    try {
        result = JSON.parse(raw);
    } catch {
        throw new Error(`Backend returned non-JSON (HTTP ${response.status}). Check the running backend.`);
    }
    if (!response.ok) throw new Error(result.message || "Assessment creation failed.");
    return result;
}


async function patchJson(path, payload) {
    const response = await fetch(`${API_BASE}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`Backend returned non-JSON (HTTP ${response.status}). Check the running backend.`); }
    if (!response.ok) throw new Error(data.message || `Request failed (HTTP ${response.status})`);
    return data;
}

export function setEvaluationReviewed(evaluationId, reviewed) {
    return patchJson(`evaluations/${encodeURIComponent(evaluationId)}/review`, { reviewed });
}

export function confirmAssessment(assessmentId) {
    return patchJson(`assessments/${encodeURIComponent(assessmentId)}/confirm`, { confirmed: true });
}


export async function createManualEvaluation(assessmentId, { memberId, recommendation, evidenceNotes }) {
    const response = await fetch(
        `${API_BASE}/assessments/${encodeURIComponent(assessmentId)}/evaluations`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ memberId, recommendation, evidenceNotes })
        }
    );
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { throw new Error(`Backend returned non-JSON (HTTP ${response.status}). Check the running backend.`); }
    if (!response.ok) throw new Error(data.message || "Could not create evaluation.");
    return data;
}


export async function loadWeightProfiles() {
    return readCollection("weight-profiles");
}

export async function createWeightProfile({ teamId, profileName, metrics }) {
    const response = await fetch(`${API_BASE}/weight-profiles`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, profileName, metrics })
    });
    const raw = await response.text();
    let result;
    try { result = JSON.parse(raw); }
    catch { throw new Error(`Backend returned non-JSON (HTTP ${response.status}). Check the running backend.`); }
    if (!response.ok) throw new Error(result.message || "Could not save profile.");
    return result;
}


export async function loadTeachers() {
    return readCollection("teachers");
}
