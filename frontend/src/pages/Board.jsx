import "../styles/Board.css"; import { useLocation, useNavigate } from "react-router-dom"; import { useEffect, useState } from "react";
import LivePreview from "../components/LivePreview";
const API = process.env.REACT_APP_API_URL || "http://localhost:5001";

const isCodeBlock = (text)=>{ if(!text) return false; return ( text.includes("function") || text.includes("const ") || text.includes("import ") || text.includes("export ") || text.includes("=>") || text.includes("{") && text.includes("}") || text.includes("npm ") || text.includes("mkdir ") || text.includes("cd ") ); };

const ChatMessage = ({msg,setModal})=>{ const code = isCodeBlock(msg.text);

if(msg.role==="user") return <div className="msg user">{msg.text}</div>;

if(code){ return ( <div className="msg ai code-msg"> <div className="code-header"> <span>AI Code</span> <button onClick={()=>navigator.clipboard.writeText(msg.text)}>Copy</button> <button onClick={()=>setModal(msg.text)}>Expand</button> </div> <pre>{msg.text}</pre> </div> ); }

return <div className="msg ai text-msg" onClick={()=>setModal(msg.text)}>{msg.text}</div>; };

export default function Board(){ const location=useLocation(); const navigate=useNavigate(); const {plan,idea}=location.state||{}; const steps=plan?.steps||[];

const [doing,setDoing]=useState(null); const [done,setDone]=useState([]); const [brief,setBrief]=useState(null); const [briefTask,setBriefTask]=useState(null); const [briefLoading,setBriefLoading]=useState(false); const [guideOpen,setGuideOpen]=useState(false); const [guide,setGuide]=useState(null); const [code,setCode]=useState(""); const [review,setReview]=useState(null); const [submitting,setSubmitting]=useState(false); const [confirmDoneOpen,setConfirmDoneOpen]=useState(false); const [pendingDoneTask,setPendingDoneTask]=useState(null); const [chat,setChat]=useState([]); const [chatInput,setChatInput]=useState(""); const [chatModal,setChatModal]=useState(null); const [liveOpen,setLiveOpen]=useState(false); const [workspaceRoot]=useState("Desktop");

useEffect(()=>{if(!plan)navigate("/");},[plan,navigate]); if(!plan)return null;

const fetchBrief=async(task)=>{ setBriefTask(task); setBriefLoading(true); setBrief(null); try{ const res=await fetch(`${API}/task-brief`,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({idea,task}) }); setBrief(await res.json()); }finally{setBriefLoading(false);} };

const startCreating=async()=>{ setDoing(briefTask); setGuideOpen(true); loadGuide(briefTask); };

const loadGuide=async(task)=>{ const res=await fetch(`${API}/task-guide`,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({idea,task}) }); setGuide(await res.json()); };

const sendChat=async()=>{ if(!chatInput.trim())return; const message=chatInput.trim(); setChat(prev=>[...prev,{role:"user",text:message}]); setChatInput("");

try{
  const res=await fetch(`${API}/task-chat`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({idea,task:doing,message,currentStep:guide,userCode:code})
  });

  const data=await res.json();
  setChat(prev=>[...prev,{role:"ai",text:data.reply||"No reply"}]);
}catch{
  setChat(prev=>[...prev,{role:"ai",text:"Error generating reply"}]);
}

};

const submitReview=async()=>{ if(submitting) return; setSubmitting(true); try{ const res=await fetch(`${API}/review-task`,{ method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({idea,task:doing,userCode:code}) }); const data=await res.json(); const raw=String(data?.status||"").trim().toLowerCase(); const status=(raw.includes("correct")?"correct":raw.includes("partial")?"partial":"wrong"); const feedback=status==="correct"?"Submission received.": "Submission received. If Live Try looks good, you can move this task to DONE."; setReview({status,feedback}); setPendingDoneTask(doing); setConfirmDoneOpen(true); }catch(e){ setReview({status:"wrong",feedback:`Submit failed: ${e?.message||"Network error"}`}); }finally{ setSubmitting(false);} };

const confirmDoneYes=()=>{ if(!pendingDoneTask) return; setDone(prev=>[...prev,pendingDoneTask]); setDoing(null); setGuideOpen(false); setCode(""); setChat([]); setLiveOpen(false); setPendingDoneTask(null); setConfirmDoneOpen(false); };
const confirmDoneNo=()=>{ setConfirmDoneOpen(false); setPendingDoneTask(null); setReview(prev=>prev?{...prev,status:"partial",feedback:"Task kept in DOING. Improve with Live Try, then submit again."}:prev); };

return(

  <div className="board-page">
    <div className="board-header"><h1>{idea}</h1><p>Execution Workspace</p></div>
    <div className="workspace-bar">Working Directory: {workspaceRoot}</div><div className="board-layout">
  <div className="kanban">
    <div className="column"><h3>TODO</h3>{steps.filter(s=>!done.includes(s)&&s!==doing).map((t,i)=>(<div key={i} className="task" onClick={()=>fetchBrief(t)}>{t}</div>))}</div>
    <div className="column"><h3>DOING</h3>{doing&&<div className="task active">{doing}</div>}</div>
    <div className="column"><h3>DONE</h3>{done.map((d,i)=>(<div key={i} className="task done">{d}</div>))}</div>
  </div>

  <div className="assistant">
    {brief&&(
    <div className="brief-panel">
      <h3>AI Generation</h3>
      <p><b>Goal:</b> {brief.goal}</p>
      <p><b>Build:</b> {brief.what_you_build}</p>
      <ul>{brief.concepts?.map((c,i)=>(<li key={i}>{c}</li>))}</ul>
      <button onClick={startCreating}>Start Creating</button>
    </div>)}
    {briefLoading&&<div className="brief-panel"><p>Generating...</p></div>}
  </div>
</div>

{guideOpen&&guide&&(
<div className="guide-overlay"><div className="guide-modal">
  <h2>{guide.step_title}</h2>

  <div className="guide-left">
    <p>{guide.instruction}</p>
    {guide.where_to_do&&<div className="path"><b>Location:</b> {guide.where_to_do}</div>}
    {guide.commands?.map((cmd,i)=>(<div key={i} className="command-line"><code>{cmd}</code><button onClick={()=>navigator.clipboard.writeText(cmd)}>Copy</button></div>))}
    {guide.file_path&&<div className="path"><b>File:</b> {guide.file_path}</div>}
    {guide.expected_result&&<div className="expected"><p>{guide.expected_result}</p></div>}
  </div>

  <div className="guide-editor">
    <div className="code-label">Paste proof of completion</div>
    <textarea value={code} onChange={e=>setCode(e.target.value)} placeholder="Paste code / terminal output / explanation" />
  </div>

  <div className="guide-chat">
    <div className="chat-messages">{chat.map((m,i)=>(<ChatMessage key={i} msg={m} setModal={setChatModal}/>))}</div>
    <div className="chat-input"><input value={chatInput} onChange={e=>setChatInput(e.target.value)} placeholder="Ask anything..."/><button onClick={sendChat}>Send</button></div>
  </div>
  <div className="guide-actions">
    {review&&<div className={`review ${review.status}`}>{review.feedback}</div>}
    <button onClick={()=>loadGuide(doing)}>Next Step</button>
    <button onClick={submitReview} disabled={submitting}>{submitting?"Submitting...":"Submit"}</button>
    <button onClick={()=>setLiveOpen(true)}>Live Try</button>
    <button onClick={()=>{setLiveOpen(false);setGuideOpen(false);}}>Close</button>
  </div>
</div></div>)}

{liveOpen&&guide&&<LivePreview guide={guide} userInput={code} apiBase={API} idea={idea} task={doing} onClose={()=>setLiveOpen(false)} />}

{chatModal&&(<div className="chat-overlay"><div className="chat-modal"><button onClick={()=>setChatModal(null)}>Close</button><pre>{chatModal}</pre><button onClick={()=>navigator.clipboard.writeText(chatModal)}>Copy</button></div></div>)}

{confirmDoneOpen&&(
  <div className="confirm-overlay">
    <div className="confirm-modal">
      <h3>Are You Satisfied With Live Try?</h3>
      <p>If yes, this task moves to DONE. If no, it stays in DOING.</p>
      <div className="confirm-actions">
        <button onClick={confirmDoneYes}>Yes, Move To Done</button>
        <button onClick={confirmDoneNo}>No, Keep In Doing</button>
      </div>
    </div>
  </div>
)}

  </div>);
}
