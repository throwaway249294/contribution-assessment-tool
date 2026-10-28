import React, { useState, useEffect, useRef } from "react";
import {
    loadAssessments,
    saveEvaluationDecision,
    loadAuditLogs,
    saveAssessmentWeights,
    loadTeams,
    createAssessment,
    setEvaluationReviewed,
    confirmAssessment,
    createManualEvaluation,
    loadWeightProfiles,
    createWeightProfile,
    loadTeachers,
} from "./api";
import "./styles.css";
import { rebalanceWeights } from "./weights";
const DEFAULT_WEIGHTS = {
    taskCompletion: 25,
    collaboration: 25,
    contributionQuality: 25,
    evidenceTraceability: 25,
};
const DEFAULT_KEYS = Object.keys(DEFAULT_WEIGHTS);
const labelForMetric = (key) =>
    key
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/^./, (c) => c.toUpperCase());
function formatValue(value) {
    if (value === null || value === undefined || value === "") return "(empty)";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (typeof value === "object")
        return Object.entries(value)
            .map(([k, v]) => `${labelForMetric(k)} ${v}`)
            .join(", ");
    return String(value);
}
const STAGES = [
    "Checking contributions",
    "Checking commit history",
    "Verifying claims",
    "Matching claims to evidence",
    "Flagging outliers",
];
const STAGE_MS = 700;
function App() {
    const [page, setPage] = useState("home");
    const [assessments, setAssessments] = useState([]);
    const [loadingAssessments, setLoadingAssessments] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [assessmentId, setAssessmentId] = useState(null);
    const [teachers, setTeachers] = useState([]);
    const [teacherError, setTeacherError] = useState("");
    const [teams, setTeams] = useState([]);
    const [selectedTeamId, setSelectedTeamId] = useState("");
    const [sprint, setSprint] = useState("2");
    const [createError, setCreateError] = useState("");
    const runRef = useRef(null);
    const [memberIndex, setMemberIndex] = useState(0);
    const [manualRecommendation, setManualRecommendation] = useState("");
    const [evidenceNotes, setEvidenceNotes] = useState("");
    const [manualError, setManualError] = useState("");
    const [manualBusy, setManualBusy] = useState(false);
    const [reviewBusy, setReviewBusy] = useState(false);
    const [reviewError, setReviewError] = useState("");
    const [confirmBusy, setConfirmBusy] = useState(false);
    const [confirmError, setConfirmError] = useState("");
    const [search, setSearch] = useState("");
    const [unit, setUnit] = useState("COS40005");
    const [team, setTeam] = useState("Team 04");
    const [repo, setRepo] = useState("cos40005-2026/team-04");
    const [docs, setDocs] = useState([]);
    const [stage, setStage] = useState(0);
    const [profiles, setProfiles] = useState([]);
    const [profileId, setProfileId] = useState("");
    const [profileName, setProfileName] = useState("");
    const [profileBusy, setProfileBusy] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsMode, setSettingsMode] = useState("new");
    const [newWeights, setNewWeights] = useState(DEFAULT_WEIGHTS);
    const [history, setHistory] = useState([]);
    const [draftWeights, setDraftWeights] = useState(DEFAULT_KEYS.map((k) => DEFAULT_WEIGHTS[k]));
    const [lastAuto, setLastAuto] = useState([]);
    const lastAdjustAt = useRef(0);
    const gestureStart = useRef(null);
    const [weightKeys, setWeightKeys] = useState(DEFAULT_KEYS);
    const [weightError, setWeightError] = useState("");
    const [savingWeights, setSavingWeights] = useState(false);
    const [editing, setEditing] = useState(false);
    const [edits, setEdits] = useState({});
    const [draft, setDraft] = useState("");
	const [reason, setReason] = useState("");
    const [expanded, setExpanded] = useState(-1);
    const [audit, setAudit] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");
    const [auditError, setAuditError] = useState("");
    const assessment = assessments.find((a) => a.id === assessmentId) ||
        assessments[0] || { id: "", title: "", members: [] };
    const activeTeam = teams.find((t) => String(t.teamName) === String(assessment.team));
    const associatedTeacher = teachers.find((t) => String(t._id) === String(activeTeam?.teacherId));
    const teacherLabel = associatedTeacher?.name || "Teacher unavailable";
    const member = assessment.members[memberIndex] ||
        assessment.members[0] || {
            name: "No member selected",
            verified: [],
            unverified: [],
            unclaimed: [],
            peer: [],
            recommendation: "No evaluation available.",
        };
    const key = assessment.id + "_" + memberIndex;
    const currentEdit = edits[key] || {};
    const memberAudit = audit[String(member.evaluationId)] || [];
	const refineDirty = page === "refinement" && (draft.trim() !== String(currentEdit.recommendation ?? member.recommendation ?? "").trim || reason.trim() !== "");
    const selectedTeam = teams.find((t) => String(t._id) === String(selectedTeamId));
    const settingsTeam = settingsMode === "new" ? selectedTeam : activeTeam;
    const settingsUnit = settingsTeam?.unitCode || (settingsMode === "new" ? unit : assessment.unit);
    const weightsLocked = settingsMode === "assessments" && assessment.teacherConfirmed;
    useEffect(() => {
        let active = true;
        loadTeachers()
            .then((records) => {
                if (active) setTeachers(records);
            })
            .catch((error) => {
                if (active) setTeacherError(error.message);
            });
        loadTeams()
            .then((records) => {
                if (active) {
                    setTeams(records);
                    setSelectedTeamId(records[0]?._id || "");
                }
            })
            .catch((error) => {
                if (active) setCreateError(error.message);
            });
        loadAssessments()
            .then((records) => {
                if (!active) return;
                setAssessments(records);
                setAssessmentId(records[0]?.id || null);
                setLoadError("");
            })
            .catch((error) => {
                if (active) setLoadError(error.message);
            })
            .finally(() => {
                if (active) setLoadingAssessments(false);
            });
        return () => {
            active = false;
        };
    }, []);
    useEffect(() => {
        if (!settingsOpen) return;
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z") {
                const tag = e.target?.tagName;
                if (tag === "TEXTAREA" || (tag === "INPUT" && e.target.type !== "range")) return;
                e.preventDefault();
                undoWeights();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [settingsOpen, history]);
    useEffect(() => {
        if (page !== "processing" || !runRef.current) return;
        if (stage >= STAGES.length) {
            finishRun();
            return;
        }
        const timer = setTimeout(() => setStage((s) => s + 1), STAGE_MS);
        return () => clearTimeout(timer);
    }, [page, stage]);
    useEffect(() => {
    if (!refineDirty) return;
    const onLeave = (e) => {
        e.preventDefault();
        e.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
}, [refineDirty]);
const navigate = (p) => {
        setPage(p);
        window.scrollTo(0, 0);
    };
    const openAssessment = (a) => {
        setAssessmentId(a.id);
        setMemberIndex(0);
        navigate("assessment");
    };
    const startRun = () => {
        setCreateError("");
        if (!selectedTeam) {
            setCreateError("Select a team.");
            return;
        }
        const number = Number(sprint);
        if (!Number.isInteger(number) || number < 1 || number > 999) {
            setCreateError("Enter a sprint number from 1 to 999.");
            return;
        }
        if (
            assessments.some(
                (a) => a.teamId === String(selectedTeam._id) && Number(a.sprintNumber) === number,
            )
        ) {
            setCreateError(
                `${selectedTeam.teamName} already has an assessment for sprint ${number}. Open it from the home page instead.`,
            );
            return;
        }
        const unmapped = (selectedTeam.members || []).filter((m) => !String(m.githubUsername || "").trim());
        if (unmapped.length) {
            setCreateError(
                `Every member needs a GitHub account before the run can start. Missing: ${unmapped.map((m) => m.name || m.memberId).join(", ")}.`,
            );
            return;
        }
        runRef.current = {
            teamId: String(selectedTeam._id),
            sprint: number,
            weights: { ...newWeights },
            finishing: false,
        };
        setStage(0);
        navigate("processing");
    };
    const finishRun = async () => {
        const run = runRef.current;
        if (!run || run.finishing) return;
        run.finishing = true;
        try {
            const created = await createAssessment({
                teamId: run.teamId,
                sprint: run.sprint,
                metricWeights: run.weights,
            });
            const records = await loadAssessments();
            setAssessments(records);
            setAssessmentId(String(created._id));
            setMemberIndex(0);
            setDocs([]);
            runRef.current = null;
            navigate("assessment");
            refreshAudit();
        } catch (error) {
            runRef.current = null;
            setCreateError(error.message);
            navigate("new");
        }
    };
    const cancelRun = () => {
        runRef.current = null;
        navigate("new");
    };
    const reloadAssessments = async () => {
        const records = await loadAssessments();
        setAssessments(records);
        await refreshAudit();
    };
    const saveManualEvaluation = async () => {
        setManualError("");
        if (!manualRecommendation.trim() || !evidenceNotes.trim()) {
            setManualError("Enter a recommendation and supporting evidence notes.");
            return;
        }
        setManualBusy(true);
        try {
            await createManualEvaluation(assessment.id, {
                memberId: String(member.id),
                recommendation: manualRecommendation,
                evidenceNotes,
            });
            await reloadAssessments();
            setManualRecommendation("");
            setEvidenceNotes("");
        } catch (error) {
            setManualError(error.message);
        } finally {
            setManualBusy(false);
        }
    };
    const toggleReviewed = async () => {
        setReviewError("");
        if (!member.evaluationId) {
            setReviewError("This member has no evaluation to review.");
            return;
        }
        setReviewBusy(true);
        try {
            await setEvaluationReviewed(member.evaluationId, !member.reviewed);
            await reloadAssessments();
        } catch (error) {
            setReviewError(error.message);
        } finally {
            setReviewBusy(false);
        }
    };
    const finishAssessment = async () => {
        setConfirmError("");
        if (
            !window.confirm(
                "Confirm this assessment? All members must have reviewed evaluations. Confirmation locks recommendations and weights.",
            )
        )
            return;
        setConfirmBusy(true);
        try {
            await confirmAssessment(assessment.id);
            await reloadAssessments();
        } catch (error) {
            setConfirmError(error.message);
        } finally {
            setConfirmBusy(false);
        }
    };
    const editMember = () => {
        if (assessment.teacherConfirmed) return;
        setDraft(currentEdit.recommendation ?? member.recommendation);
		setReason("");
        setSaveError("");
        setEditing(true);
        navigate("refinement");
    };
	const leaveRefinement = () => {
		if (refineDirty || !window.confirm("Your changed have not been saved. Leave anyway?")) return;
		setReason("");
		navigate("assessment");
	};
    const refreshAudit = async () => {
        try {
            const logs = await loadAuditLogs();
            const grouped = {};
            for (const log of logs) {
                const id = String(log.evaluationId || "");
                const entry = {
                    message: log.action || "Recommendation updated",
                    date: log.createdAt ? new Date(log.createdAt).toLocaleString() : "",
                    detail: `${log.fieldChanged || "Recommendation"}: ${formatValue(log.previousValue)} → ${formatValue(log.newValue)}`,
                };
                if (!grouped[id]) grouped[id] = [];
                grouped[id].push(entry);
            }
            setAudit(grouped);
            setAuditError("");
        } catch (error) {
            setAuditError(error.message);
        }
    };
    useEffect(() => {
        refreshAudit();
    }, []);
    const saveMember = async () => {
        setSaveError("");
        if (assessment.teacherConfirmed) {
            setSaveError("Confirmed assessments are locked.");
            return;
        }
        if (!draft.trim()) {
            setSaveError("Enter a recommendation before saving.");
            return;
        }
        if (!member.evaluationId) {
            setSaveError("This member has no evaluation in MongoDB. No changes were saved.");
            return;
        }
        if (saving) return;
        setSaving(true);
        try {
            const saved = await saveEvaluationDecision(member.evaluationId, draft, reason.trim());
            setAssessments((items) =>
                items.map((item) =>
                    item.id !== assessment.id
                        ? item
                        : {
                              ...item,
                              members: item.members.map((person) =>
                                  person.id !== member.id
                                      ? person
                                      : {
                                            ...person,
                                            recommendation: saved.recommendation,
                                        },
                              ),
                          },
                ),
            );
            setEdits((e) => ({ ...e, [key]: { ...e[key], recommendation: saved.recommendation } }));
			setReason("");
            await refreshAudit();
            setEditing(false);
            navigate("assessment");
        } catch (error) {
            setSaveError(error.message);
        } finally {
            setSaving(false);
        }
    };
    const adjustWeight = (index, value) => {
        if (weightsLocked) return;
        const result = rebalanceWeights(draftWeights, index, value);
        if (result.blocked) {
            setWeightError(result.blocked);
            return;
        }
        if (result.values.every((v, i) => v === draftWeights[i])) return;
        // one drag counts as one change, so undo reverses the whole drag
        const now = Date.now();
        if (now - lastAdjustAt.current > 600) {
            setHistory((h) => [draftWeights, ...h].slice(0, 30));
            gestureStart.current = draftWeights;
        }
        lastAdjustAt.current = now;
        const before = gestureStart.current || draftWeights;
        setDraftWeights(result.values);
        setLastAuto(
            result.values.map((_, i) => i).filter((i) => i !== index && result.values[i] !== before[i]),
        );
        setWeightError("");
    };
    const undoWeights = () => {
        if (!history.length) return;
        setDraftWeights(history[0]);
        setHistory((h) => h.slice(1));
        setLastAuto([]);
        lastAdjustAt.current = 0;
    };
    const resetWeights = () => {
        const sameKeys =
            weightKeys.length === DEFAULT_KEYS.length && weightKeys.every((k) => DEFAULT_KEYS.includes(k));
        const even = Math.floor(100 / weightKeys.length);
        setHistory((h) => [draftWeights, ...h].slice(0, 30));
        setDraftWeights(
            sameKeys
                ? weightKeys.map((k) => DEFAULT_WEIGHTS[k])
                : weightKeys.map((_, i) => even + (i === 0 ? 100 - even * weightKeys.length : 0)),
        );
        setLastAuto([]);
        lastAdjustAt.current = 0;
    };
    const openSettings = () => {
        const databaseWeights = assessment.metricWeights || {};
        const keys = Object.keys(databaseWeights);
        setWeightKeys(keys);
        setDraftWeights(keys.length ? keys.map((k) => databaseWeights[k]) : [...weights]);
        setWeightError("");
        setHistory([]);
        setAddingMetric(false);
        setNewMetricName("");
        setProfileId("");
        setProfileName("");
        loadWeightProfiles()
            .then(setProfiles)
            .catch((error) => setWeightError(error.message));
        setSettingsOpen(true);
    };
    const applicableProfiles = profiles.filter(
        (profile) =>
            settingsTeam &&
            String(profile.teacherId) === String(settingsTeam.teacherId) &&
            String(profile.unitCode) === String(settingsUnit) &&
            weightKeys.length === Object.keys(profile.metrics || {}).length &&
            weightKeys.every((key) => Object.hasOwn(profile.metrics || {}, key)),
    );
    const applyProfile = () => {
        const profile = applicableProfiles.find((item) => String(item._id) === profileId);
        if (!profile) {
            setWeightError("Select a compatible profile.");
            return;
        }
        setHistory((h) => [draftWeights, ...h].slice(0, 30));
        setDraftWeights(weightKeys.map((key) => profile.metrics[key]));
        setLastAuto([]);
        setWeightError("");
    };
    const saveProfile = async () => {
        setWeightError("");
        if (!settingsTeam) {
            setWeightError("The team could not be resolved.");
            return;
        }
        if (!profileName.trim()) {
            setWeightError("Enter a profile name.");
            return;
        }
        if (
            !window.confirm(
                `Save profile "${profileName.trim()}"? It will be available for every assessment in ${settingsUnit || "this unit"}.`,
            )
        )
            return;
        setProfileBusy(true);
        try {
            await createWeightProfile({
                teamId: String(settingsTeam._id),
                profileName: profileName.trim(),
                metrics: Object.fromEntries(weightKeys.map((key, index) => [key, draftWeights[index]])),
            });
            setProfiles(await loadWeightProfiles());
            setProfileName("");
        } catch (error) {
            setWeightError(error.message);
        } finally {
            setProfileBusy(false);
        }
    };
    const saveSettings = async () => {
        if (savingWeights || weightsLocked) return;
        setWeightError("");
        const metricWeights = Object.fromEntries(weightKeys.map((key, index) => [key, draftWeights[index]]));
        if (settingsMode === "new") {
            if (
                !window.confirm(
                    "Use these weights for the new assessment? They apply only to the assessment you are about to run.",
                )
            )
                return;
            setNewWeights(metricWeights);
            setSettingsOpen(false);
            return;
        }
        if (
            !window.confirm(
                `Save these weights for ${assessment.title}? This changes how this assessment is weighted, and the change is recorded in its audit log.`,
            )
        )
            return;
        setSavingWeights(true);
        try {
            const saved = await saveAssessmentWeights(assessment.id, metricWeights);
            setAssessments((items) =>
                items.map((item) =>
                    item.id === assessment.id ? { ...item, metricWeights: saved.metricWeights } : item,
                ),
            );
            setSettingsOpen(false);
            await refreshAudit();
        } catch (error) {
            setWeightError(error.message);
        } finally {
            setSavingWeights(false);
        }
    };
    const upload = (e) => {
        setDocs((old) => [
            ...old,
            ...Array.from(e.target.files || []).map((f) => ({ name: f.name, size: f.size })),
        ]);
        e.target.value = "";
    };
    const heading = (text) => <h2>{text}</h2>;
    return (
        <div className="site">
            {page === "home" && (
                <>
                    <header className="site_header">
                        <strong>{unit} Assessment</strong>
                        <span>{teacherLabel}</span>
                    </header>
                    <div className="home_shell">
                        <aside className="sidebar">
                            <button onClick={() => navigate("home")}>Assessments +</button>
                            <button onClick={openConfiguration}>Configuration</button>
                            <button onClick={() => navigate("audit")}>Audit Log</button>
                        </aside>
                        <main className="home_content">
                            <h1>Assessments</h1>
                            {teacherError && (
                                <p role="alert">Teacher information unavailable: {teacherError}</p>
                            )}
                            {associatedTeacher && (
                                <section className="panel">
                                    <h2>Associated educator</h2>
                                    <p>
                                        <strong>{associatedTeacher.name}</strong> · {associatedTeacher.email}
                                    </p>
                                    <p>
                                        Role: {associatedTeacher.role} · Unit:{" "}
                                        {activeTeam?.unitCode || assessment.unit}
                                    </p>
                                </section>
                            )}
                            {loadingAssessments && <p>Loading assessments...</p>}
                            {loadError && <p role="alert">Could not load assessments: {loadError}</p>}
                            {!loadingAssessments && !loadError && assessments.length === 0 && (
                                <p>No assessments found.</p>
                            )}
                            <div className="home_toolbar">
                                <input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by unit or team"
                                />
                                <button className="primary" onClick={() => navigate("new")}>
                                    New assessment
                                </button>
                            </div>
                            {assessments
                                .filter((a) =>
                                    (a.title + " " + a.unit).toLowerCase().includes(search.toLowerCase()),
                                )
                                .map((a) => (
                                    <div className="assessment_row" key={a.id}>
                                        <div>
                                            <strong>{a.title}</strong>
                                            <small>
                                                {a.members.length} members, {a.unit}
                                            </small>
                                        </div>
                                        <button onClick={() => openAssessment(a)}>Open</button>
                                    </div>
                                ))}
                        </main>
                    </div>
                </>
            )}
            {page === "new" && (
                <main className="narrow">
                    <div className="top_actions">
                        <button onClick={() => navigate("home")}>‹ Assessments</button>
                    </div>
                    <section className="panel">
                        <h2>Team</h2>
                        <div className="two_inputs">
                            <label>
                                Team
                                <select
                                    value={selectedTeamId}
                                    onChange={(e) => setSelectedTeamId(e.target.value)}
                                >
                                    {teams.map((item) => (
                                        <option key={item._id} value={item._id}>
                                            {item.teamName} ({item.unitCode})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Sprint
                                <input
                                    type="number"
                                    min="1"
                                    max="999"
                                    value={sprint}
                                    onChange={(e) => setSprint(e.target.value)}
                                />
                            </label>
                        </div>
                    </section>
                    <section className="panel">
                        <h2>Documents</h2>
                        <label className="upload">
                            Drop files, or browse
                            <input type="file" multiple onChange={upload} />
                            <span>PDF, DOCX, MD · up to 20 files · reports and peer reviews</span>
                        </label>
                        {docs.map((d, i) => (
                            <div className="file_row" key={i}>
                                {d.name}
                                <button onClick={() => setDocs((x) => x.filter((_, j) => j !== i))}>×</button>
                            </div>
                        ))}
                    </section>
                    <section className="panel">
                        <h2>Repository</h2>
                        <input
                            value={repo}
                            onChange={(e) => setRepo(e.target.value)}
                            placeholder="GitHub repository link"
                        />
                    </section>
                    <section className="panel compact">
                        <span>
                            <strong>Weighting</strong>
                            <small>
                                {DEFAULT_KEYS.map((k) => `${labelForMetric(k)} ${newWeights[k]}%`).join(", ")}
                            </small>
                        </span>
                        <button onClick={() => openSettings("new")}>Edit</button>
                    </section>
                    <div className="footer_actions">
                        {createError && <p role="alert">{createError}</p>}
                        <button className="primary" onClick={startRun}>
                            Run assessment
                        </button>
                    </div>
                </main>
            )}
            {page === "processing" && (
                <main className="narrow">
                    <h1>Assessing contributions</h1>
                    <p className="preview_note">
                        Preview: these steps are simulated until the analysis pipeline is connected. Nothing
                        is saved until they finish.
                    </p>
                    <section className="panel">
                        <ol className="stage_list">
                            {STAGES.map((name, i) => (
                                <li key={name} className={i < stage ? "done" : i === stage ? "current" : ""}>
                                    <span className="stage_mark" aria-hidden="true">
                                        {i < stage ? "✓" : ""}
                                    </span>
                                    {name}
                                </li>
                            ))}
                        </ol>
                    </section>
                    <div className="footer_actions">
                        <button onClick={cancelRun} disabled={stage >= STAGES.length}>
                            {stage >= STAGES.length ? "Saving..." : "Cancel run"}
                        </button>
                    </div>
                </main>
            )}
            {page === "assessment" && (
                <main className="narrow">
                    <div className="top_actions">
                        <button onClick={() => navigate("home")}>‹ Assessments</button>
                        <strong>{assessment.title}</strong>
                        <button
                            onClick={() => openSettings("assessment")}
                            disabled={assessment.teacherConfirmed || !assessment.id}
                        >
                            Adjust weights
                        </button>
                    </div>
                    <p>Educator: {teacherLabel}</p>
                    {page === "processing" && (
    <main className="narrow">
        <h1>Assessing contributions</h1>
        <p className="preview_note">
            Preview: these steps are simulated until the analysis pipeline is connected. Nothing is saved
            until they finish.
        </p>
        <section className="panel">
            <ol className="stage_list">
                {STAGES.map((name, i) => (
                    <li key={name} className={i < stage ? "done" : i === stage ? "current" : ""}>
                        <span className="stage_mark" aria-hidden="true">
                            {i < stage ? "✓" : ""}
                        </span>
                        {name}
                    </li>
                ))}
            </ol>
        </section>
        <div className="footer_actions">
            <button onClick={cancelRun} disabled={stage >= STAGES.length}>
                {stage >= STAGES.length ? "Saving..." : "Cancel run"}
            </button>
        </div>
    </main>
)}
                    <section className="panel">
                        <h2>{member.name}</h2>
                        <div className="evidence_group">
                            <strong>Verified claims</strong>
                            <ul>
                                {member.verified.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="evidence_group">
                            <strong>Unverified claims</strong>
                            <ul>
                                {member.unverified.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="evidence_group">
                            <strong>Unclaimed work</strong>
                            <ul>
                                {member.unclaimed.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="evidence_group">
                            <strong>Peer review</strong>
                            <ul>
                                {member.peer.map((s, i) => (
                                    <li key={i}>{s}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="recommendation">
                            <strong>Overall recommendation</strong>
                            <p>{currentEdit.recommendation ?? member.recommendation}</p>
                            <button
                                onClick={editMember}
                                disabled={assessment.teacherConfirmed || !member.evaluationId}
                            >
                                Edit
                            </button>
                        </div>
                        <div className="footer_actions">
                            <strong>
                                Evaluation review:{" "}
                                {member.evaluationId
                                    ? member.reviewed
                                        ? "Reviewed"
                                        : "Not reviewed"
                                    : "No evaluation"}
                            </strong>
                            <button
                                onClick={toggleReviewed}
                                disabled={reviewBusy || assessment.teacherConfirmed || !member.evaluationId}
                            >
                                {reviewBusy
                                    ? "Saving..."
                                    : member.reviewed
                                      ? "Reopen review"
                                      : "Mark reviewed"}
                            </button>
                        </div>
                        {reviewError && <p role="alert">{reviewError}</p>}
                    </section>
                    {!member.evaluationId && !assessment.teacherConfirmed && (
                        <section className="panel">
                            <h2>Create manual evaluation</h2>
                            <label className="text_label">
                                Supporting evidence notes
                                <textarea
                                    rows="4"
                                    value={evidenceNotes}
                                    onChange={(e) => setEvidenceNotes(e.target.value)}
                                    placeholder="Describe the evidence you reviewed and its source"
                                />
                            </label>
                            <label className="text_label">
                                Educator recommendation
                                <textarea
                                    rows="5"
                                    value={manualRecommendation}
                                    onChange={(e) => setManualRecommendation(e.target.value)}
                                    placeholder="Write your assessment of this student's contribution"
                                />
                            </label>
                            {manualError && <p role="alert">{manualError}</p>}
                            <button className="primary" onClick={saveManualEvaluation} disabled={manualBusy}>
                                {manualBusy ? "Saving..." : "Save manual evaluation"}
                            </button>
                        </section>
                    )}
                    <section className="panel">
                        <h2>Assessment confirmation</h2>
                        <p>
                            Status: {assessment.status}
                            {assessment.teacherConfirmed ? " (confirmed and locked)" : ""}
                        </p>
                        {confirmError && <p role="alert">{confirmError}</p>}
                        <button
                            className="primary"
                            onClick={finishAssessment}
                            disabled={confirmBusy || assessment.teacherConfirmed}
                        >
                            {confirmBusy
                                ? "Confirming..."
                                : assessment.teacherConfirmed
                                  ? "Confirmed"
                                  : "Confirm assessment"}
                        </button>
                    </section>
                </main>
            )}
            {page === "refinement" && (
                <main className="narrow">
                    <div className="top_actions">
                        <button onClick={leaveRefinement}>‹ Back to assessment</button>
                    </div>
                    <section className="panel">
                        <h1>Editing recommendation</h1>
                        <label className="text_label">
                            Recommendation
                            <textarea rows="6" value={draft} onChange={(e) => setDraft(e.target.value)} />
                        </label>
                        <label className="text_label">
                            Reason for change (optional)
                            <textarea
                                rows="2"
                                maxLength={1000}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="What did you see that the system did not?"
                            />
                        </label>
                        {saveError && <p role="alert">{saveError}</p>}
                        <strong>Verified claims:</strong>
                        <ul>
                            {member.verified.map((s, i) => (
                                <li key={i}>{s}</li>
                            ))}
                        </ul>
                        <div className="footer_actions">
                            <button onClick={leaveRefinement}>Cancel</button>
                            <button className="primary" onClick={saveMember} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </section>
                    <section className="panel">
                        <h2>Audit log</h2>
                        {memberAudit.map((a, i) => (
                            <div className="audit_item" key={i}>
                                <button onClick={() => setExpanded(expanded === i ? -1 : i)}>
                                    {a.date}: {a.message} {expanded === i ? "⌃" : "⌄"}
                                </button>
                                {expanded === i && <p>{a.detail}</p>}
                            </div>
                        ))}
                    </section>
                </main>
            )}
            {page === "audit" && (
                <main className="narrow">
                    <div className="top_actions">
                        <button onClick={() => navigate("home")}>‹ Assessments</button>
                    </div>
                    <section className="panel">
                        <h1>Audit Log</h1>
                        {auditError && <p role="alert">{auditError}</p>}
                        {Object.entries(audit).flatMap(([k, v]) =>
                            v.map((a, i) => (
                                <p key={k + i}>
                                    {a.date} — {a.message}: {a.detail}
                                </p>
                            )),
                        )}
                    </section>
                </main>
            )}
            {settingsOpen && (
                <div className="modal_backdrop">
                    <div className="modal">
                        <div className="modal_heading">
                            <h2>Settings</h2>
                            <button onClick={() => setSettingsOpen(false)}>×</button>
                        </div>
                        <p>
                            {settingsMode === "new" ? "For the new assessment" : `For ${assessment.title}`}
                            {weightsLocked ? " (confirmed and locked)" : ""}
                        </p>
                        {weightKeys.map((key, i) => {
                            const automatic = lastAuto.includes(i);
                            return (
                                <div className={"weight_row" + (automatic ? " auto" : "")} key={key}>
                                    <div>
                                        <strong>
                                            {labelForMetric(key)}
                                            {automatic && <span className="tag">Adjusted automatically</span>}
                                        </strong>
                                        <span>{draftWeights[i] || 0}</span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={draftWeights[i] || 0}
                                        disabled={weightsLocked}
                                        onChange={(e) => adjustWeight(i, e.target.value)}
                                    />
                                </div>
                            );
                        })}
                        <div className="weight_info">
                            Undo the last change (Ctrl+Z), or go back to the defaults.
                            <span>
                                <button onClick={undoWeights} disabled={!history.length || weightsLocked}>
                                    UNDO
                                </button>{" "}
                                <button onClick={resetWeights} disabled={weightsLocked}>
                                    Reset to default
                                </button>
                            </span>
                        </div>
                        {settingsTeam && (
                            <div className="profile_controls">
                                <h3>Reusable weight profiles</h3>
                                <label>
                                    Saved profiles
                                    <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
                                        <option value="">Select a profile</option>
                                        {applicableProfiles.map((profile) => (
                                            <option key={profile._id} value={profile._id}>
                                                {profile.profileName}
                                                {profile.isDefault ? " (Default)" : ""}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    onClick={applyProfile}
                                    disabled={!profileId || weightsLocked}
                                >
                                    Load selected profile
                                </button>
                                <label>
                                    New profile name
                                    <input
                                        value={profileName}
                                        onChange={(e) => setProfileName(e.target.value)}
                                        placeholder="Profile name"
                                        maxLength="100"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={saveProfile}
                                    disabled={profileBusy || !profileName.trim()}
                                >
                                    {profileBusy ? "Saving profile..." : "Save as new profile"}
                                </button>
                            </div>
                        )}
                        {weightError && <p role="alert">{weightError}</p>}
                        <div className="footer_actions">
                            <button onClick={() => setSettingsOpen(false)}>Cancel</button>
                            <button
                                onClick={saveSettings}
                                disabled={savingWeights || weightsLocked}
                                className="primary"
                            >
                                {savingWeights ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
export default App;
