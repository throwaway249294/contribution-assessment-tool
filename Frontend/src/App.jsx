import React,{useState,useEffect} from 'react';
import {initial_assessments} from './data';
import './styles.css';
const metricNames=['Repository evidence','Claim verification','Peer appraisal','Non-code documents'];
const initialWeights=[40,25,25,10];
const stages=['Checking contributions','Verifying claims','Reading documents','Matching claims to evidence','Detecting unevidenced work','Flagging outliers'];
function App(){
 const [page,setPage]=useState('home');
 const [assessments,setAssessments]=useState(initial_assessments);
 const [assessmentId,setAssessmentId]=useState(initial_assessments[0].id);
 const [memberIndex,setMemberIndex]=useState(0);
 const [search,setSearch]=useState('');
 const [unit,setUnit]=useState('COS40005');const [team,setTeam]=useState('Team 04');const [repo,setRepo]=useState('cos40005-2026/team-04');const [docs,setDocs]=useState([]);
 const [stage,setStage]=useState(0);const [seconds,setSeconds]=useState(0);
 const [settingsOpen,setSettingsOpen]=useState(false);const [weights,setWeights]=useState(initialWeights);const [history,setHistory]=useState([]);
 const [draftWeights,setDraftWeights]=useState(initialWeights);const [editing,setEditing]=useState(false);
 const [edits,setEdits]=useState({});const [draft,setDraft]=useState('');const [expanded,setExpanded]=useState(-1);
 const [audit,setAudit]=useState({});const [customMetric,setCustomMetric]=useState([]);const [newMetricName,setNewMetricName]=useState('');const [addingMetric,setAddingMetric]=useState(false);
 const assessment=assessments.find(a=>a.id===assessmentId)||assessments[0];
 const member=assessment.members[memberIndex]||assessment.members[0];
 const key=assessment.id+'_'+memberIndex;
 const currentEdit=edits[key]||{};
 useEffect(()=>{if(page!=='processing')return;const timer=setInterval(()=>{setSeconds(s=>s+1);setStage(s=>Math.min(6,s+1))},2500);return()=>clearInterval(timer)},[page]);
 const navigate=(p)=>{setPage(p);window.scrollTo(0,0)};
 const openAssessment=(a)=>{setAssessmentId(a.id);setMemberIndex(0);navigate('assessment')};
 const startRun=()=>{const id='new_'+Date.now();const fresh={...initial_assessments[0],id,title:team+' — Sprint 3',unit,team,status:'Needs review',date:'Today',members:initial_assessments[0].members.map(m=>({...m}))};setAssessments(a=>[fresh,...a]);setAssessmentId(id);setMemberIndex(0);setStage(0);setSeconds(0);navigate('processing')};
 const editMember=()=>{setDraft(currentEdit.recommendation??member.recommendation);setEditing(true);navigate('refinement')};
 const saveMember=()=>{setEdits(e=>({...e,[key]:{...e[key],recommendation:draft}}));setAudit(a=>({...a,[key]:[{message:'Recommendation updated',date:new Date().toLocaleDateString()},...(a[key]||[])]}));setEditing(false);navigate('assessment')};
 const adjustWeight=(index,value)=>{
  const target=Math.max(0,Math.min(100,Math.round(Number(value))));
  const previous=[...draftWeights];
  const next=[...previous];
  const otherIndices=previous.map((_,i)=>i).filter(i=>i!==index);
  if(!otherIndices.length){setDraftWeights([100]);return;}
  const remaining=100-target;
  const otherTotal=otherIndices.reduce((sum,i)=>sum+previous[i],0);
  const allocations=otherIndices.map(i=>({
   index:i,
   exact:otherTotal>0?previous[i]/otherTotal*remaining:remaining/otherIndices.length
  }));
  allocations.forEach(item=>{next[item.index]=Math.floor(item.exact)});
  let remainder=remaining-allocations.reduce((sum,item)=>sum+Math.floor(item.exact),0);
  allocations.sort((a,b)=>(b.exact-Math.floor(b.exact))-(a.exact-Math.floor(a.exact))||a.index-b.index);
  for(let i=0;i<remainder;i++)next[allocations[i].index]++;
  next[index]=target;
  setHistory(h=>[previous,...h]);
  setDraftWeights(next);
 };
 const openSettings=()=>{setDraftWeights([...weights]);setHistory([]);setAddingMetric(false);setNewMetricName('');setSettingsOpen(true)};
 const upload=(e)=>{setDocs(old=>[...old,...Array.from(e.target.files||[]).map(f=>({name:f.name,size:f.size}))]);e.target.value=''};
 const heading=(text)=> <h2>{text}</h2>;
 return <div className="site">
 {page==='home'&&<><header className="site_header"><strong>{unit} Assessment</strong><span>Instructor ●</span></header><div className="home_shell"><aside className="sidebar"><button onClick={()=>navigate('home')}>Assessments +</button><button onClick={openSettings}>Config</button><button onClick={()=>navigate('audit')}>Audit Log</button></aside><main className="home_content"><h1>Assessments</h1><div className="home_toolbar"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by unit or team"/><button className="primary" onClick={()=>navigate('new')}>New assessment</button></div>{assessments.filter(a=>(a.title+' '+a.unit).toLowerCase().includes(search.toLowerCase())).map(a=><div className="assessment_row" key={a.id}><div><strong>{a.title}</strong><small>{a.members.length} members, {a.unit}</small></div><button onClick={()=>openAssessment(a)}>Open</button></div>)}</main></div></>}
 {page==='new'&&<main className="narrow"><div className="top_actions"><button onClick={()=>navigate('home')}>‹ Assessments</button></div><section className="panel"><h2>Team</h2><div className="two_inputs"><label>Unit<input value={unit} onChange={e=>setUnit(e.target.value)}/></label><label>Team<input value={team} onChange={e=>setTeam(e.target.value)}/></label></div></section><section className="panel"><h2>Documents</h2><label className="upload">Drop files, or browse<input type="file" multiple onChange={upload}/><span>PDF, DOCX, MD · up to 20 files</span></label>{docs.map((d,i)=><div className="file_row" key={i}>{d.name}<button onClick={()=>setDocs(x=>x.filter((_,j)=>j!==i))}>×</button></div>)}</section><section className="panel"><h2>Repository</h2><input value={repo} onChange={e=>setRepo(e.target.value)} placeholder="GitHub repository link"/></section><section className="panel compact"><span>Weighting</span><button onClick={openSettings}>Edit</button></section><div className="footer_actions"><button className="primary" onClick={startRun}>Run assessment</button></div></main>}
 {page==='processing'&&<main className="narrow"><h1>Running script</h1><p>Time elapsed: {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} | ETA: {stage>=6?'Complete':'12:30'}</p><section className="panel">{stages.map((s,i)=><label className="stage_row" key={s}><input type="checkbox" checked={stage>i} readOnly/>{s}</label>)}</section><section className="panel">{assessment.members.map((m,i)=><div key={i} className="processing_member">{m.name}: {stage>=6||i<Math.floor(stage/2)?'Complete':'Pending...'}</div>)}</section><div className="footer_actions"><button onClick={()=>navigate('home')}>Cancel run</button>{stage>=6&&<button className="primary" onClick={()=>navigate('assessment')}>Open assessment</button>}</div></main>}
 {page==='assessment'&&<main className="narrow"><div className="top_actions"><button onClick={()=>navigate('home')}>‹ Assessments</button><strong>{assessment.title}</strong></div><section className="panel"><h2>Member Select</h2><div className="member_tabs">{assessment.members.map((m,i)=><button key={i} className={i===memberIndex?'selected':''} onClick={()=>setMemberIndex(i)}>{m.name}</button>)}</div></section><section className="panel"><h2>{member.name}</h2><div className="evidence_group"><strong>Verified claims</strong><ul>{member.verified.map((s,i)=><li key={i}>{s}</li>)}</ul></div><div className="evidence_group"><strong>Unverified claims</strong><ul>{member.unverified.map((s,i)=><li key={i}>{s}</li>)}</ul></div><div className="evidence_group"><strong>Evidence that was wrongly claimed</strong><ul>{member.wrongly.map((s,i)=><li key={i}>{s}</li>)}</ul></div><div className="evidence_group"><strong>Peer review</strong><ul>{member.peer.map((s,i)=><li key={i}>{s}</li>)}</ul></div><div className="recommendation"><strong>Overall recommendation</strong><p>{currentEdit.recommendation??member.recommendation}</p><button onClick={editMember}>Edit</button></div></section></main>}
 {page==='refinement'&&<main className="narrow"><div className="top_actions"><button onClick={()=>navigate('assessment')}>‹ Back to assessment</button></div><section className="panel"><h1>Editing recommendation</h1><label className="text_label">Recommendation<textarea rows="6" value={draft} onChange={e=>setDraft(e.target.value)}/></label><strong>Verified claims:</strong><ul>{member.verified.map((s,i)=><li key={i}>{s}</li>)}</ul><div className="footer_actions"><button onClick={()=>navigate('assessment')}>Cancel</button><button className="primary" onClick={saveMember}>Save</button></div></section><section className="panel"><h2>Audit log</h2>{(audit[key]||[]).map((a,i)=><div className="audit_item" key={i}><button onClick={()=>setExpanded(expanded===i?-1:i)}>{a.date}: {a.message} {expanded===i?'⌃':'⌄'}</button>{expanded===i&&<p>{a.message} for {member.name}</p>}</div>)}</section></main>}
 {page==='audit'&&<main className="narrow"><div className="top_actions"><button onClick={()=>navigate('home')}>‹ Assessments</button></div><section className="panel"><h1>Audit Log</h1>{Object.entries(audit).flatMap(([k,v])=>v.map((a,i)=><p key={k+i}>{a.date} — {a.message}</p>))}</section></main>}
 {settingsOpen&&<div className="modal_backdrop"><div className="modal"><div className="modal_heading"><h2>Settings</h2><button onClick={()=>setSettingsOpen(false)}>×</button></div>{[...metricNames,...customMetric].map((name,i)=><div className="weight_row" key={name}><div><strong>{name}</strong><span>{draftWeights[i]||0}</span></div><input type="range" min="0" max="100" value={draftWeights[i]||0} onChange={e=>adjustWeight(i,e.target.value)}/></div>)}<div className="weight_info">Rebalanced automatically <button onClick={()=>{if(history.length){setDraftWeights(history[0]);setHistory(h=>h.slice(1))}}} disabled={!history.length}>UNDO</button></div>{addingMetric&&<div className="add_metric_row"><input value={newMetricName} onChange={e=>setNewMetricName(e.target.value)} placeholder="Metric name" aria-label="Metric name"/><button onClick={()=>{if(newMetricName.trim()){setCustomMetric(x=>[...x,newMetricName.trim()]);setDraftWeights(x=>[...x,0]);setNewMetricName('');setAddingMetric(false)}}}>Add</button><button onClick={()=>setAddingMetric(false)}>Cancel</button></div>}<div className="footer_actions"><button onClick={()=>setSettingsOpen(false)}>Cancel</button><button onClick={()=>{setWeights([...draftWeights]);setSettingsOpen(false)}} className="primary">Save</button><button onClick={()=>setAddingMetric(true)}>+ Add new metric</button></div></div></div>}
 </div>
}
export default App;
