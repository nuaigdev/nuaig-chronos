'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
} from 'recharts'
import {
  Download, RefreshCw, TrendingUp, Users, FolderKanban, Clock,
  Building2, ArrowLeft, Calendar, Layers,
} from 'lucide-react'
import {
  format, startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
  eachWeekOfInterval, subWeeks,
} from 'date-fns'
import toast from 'react-hot-toast'

const supabase = createClient()

const COLORS = ['#a78bfa','#60a5fa','#34d399','#fbbf24','#f87171','#fb923c','#e879f9','#2dd4bf','#a3e635','#38bdf8']
const ACCENT  = '#a78bfa'
const GRID    = '#1e1e2e'
const STATUS_COLORS: Record<string, string> = {
  draft:'#64748b', submitted:'#fbbf24', approved:'#34d399', rejected:'#f87171',
}

type Tab    = 'overview' | 'projects' | 'clients' | 'employees'
type Period = 'week' | 'month' | 'quarter' | 'year'

interface RawLog { hours:number; log_date:string; project_id:string; user_id:string; task_type_id:string|null }
interface EnrichedLog extends RawLog { projectName:string; clientId:string|null; clientName:string; userName:string; department:string; taskTypeName:string }
interface ProjectDetail { id:string; name:string; status:string; client_id:string|null; estimated_hours:number|null }
interface ClientDetail  { id:string; name:string }
interface ProfileDetail { id:string; full_name:string; department:string; manager_id:string|null }
interface TaskTypeDetail { id:string; name:string; department:string }
interface TimesheetRow  { id:string; user_id:string; userName:string; week_start_date:string; week_end_date:string; status:string; total_hours:number; submitted_at:string|null }

function getPeriodRange(p:Period):{start:Date;end:Date}{
  const n=new Date()
  switch(p){
    case'week':    return{start:startOfWeek(n,{weekStartsOn:1}),end:endOfWeek(n,{weekStartsOn:1})}
    case'month':   return{start:startOfMonth(n),end:endOfMonth(n)}
    case'quarter': return{start:startOfQuarter(n),end:endOfQuarter(n)}
    case'year':    return{start:startOfYear(n),end:endOfYear(n)}
  }
}
function pLabel(p:Period,s:Date,e:Date){return`${p[0].toUpperCase()+p.slice(1)}: ${format(s,'MMM d, yyyy')} – ${format(e,'MMM d, yyyy')}`}
function h(v:number){return`${v.toFixed(1)}h`}
function sumH(ls:EnrichedLog[]){return ls.reduce((s,l)=>s+l.hours,0)}
function gby<T>(arr:T[],k:(i:T)=>string):Record<string,T[]>{
  return arr.reduce((a,i)=>{const key=k(i);if(!a[key])a[key]=[];a[key].push(i);return a},{} as Record<string,T[]>)
}

const TT={
  contentStyle:{background:'#1a1a2e',border:'1px solid #2a2a3e',borderRadius:'8px',fontSize:'12px'},
  labelStyle:{color:'#e2e8f0',fontWeight:600},
  itemStyle:{color:ACCENT},
}

function SCard({icon,label,value,sub,color=ACCENT}:{icon:React.ReactNode;label:string;value:string|number;sub?:string;color?:string}){
  return(
    <div className="card-base" style={{padding:'20px 22px',display:'flex',gap:'16px',alignItems:'center'}}>
      <div style={{width:'44px',height:'44px',borderRadius:'12px',background:`${color}18`,display:'flex',alignItems:'center',justifyContent:'center',color,flexShrink:0}}>{icon}</div>
      <div>
        <div style={{fontSize:'11px',color:'var(--chronos-text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'4px'}}>{label}</div>
        <div style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:800,color:'var(--chronos-text)',lineHeight:1}}>{value}</div>
        {sub&&<div style={{fontSize:'11px',color:'var(--chronos-text-muted)',marginTop:'3px'}}>{sub}</div>}
      </div>
    </div>
  )
}

function MiniBar({label,value,max,color}:{label:string;value:number;max:number;color:string}){
  const pct=max>0?Math.min((value/max)*100,100):0
  return(
    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
      <div style={{width:'120px',fontSize:'12px',color:'var(--chronos-text)',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{label}</div>
      <div style={{flex:1,height:'6px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:'3px'}}/>
      </div>
      <div style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color,flexShrink:0,minWidth:'48px',textAlign:'right'}}>{h(value)}</div>
    </div>
  )
}

function SecTitle({title,sub}:{title:string;sub?:string}){
  return(
    <div style={{marginBottom:'14px'}}>
      <div style={{fontFamily:'var(--font-display)',fontWeight:700,fontSize:'15px',color:'var(--chronos-text)'}}>{title}</div>
      {sub&&<div style={{fontSize:'12px',color:'var(--chronos-text-muted)',marginTop:'2px'}}>{sub}</div>}
    </div>
  )
}

function buildHTML(title:string,period:string,sections:{heading:string;html:string}[]):string{
  return`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#0f0f17;color:#e2e8f0;padding:40px 48px}
h1{font-size:26px;font-weight:800;color:#fff;margin-bottom:4px}.period{font-size:13px;color:#64748b;margin-bottom:36px;padding-bottom:20px;border-bottom:1px solid #1e1e2e}
.section{margin-bottom:36px}.section h2{font-size:16px;font-weight:700;color:#a78bfa;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #1e1e2e}
table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;padding:10px 14px;border-bottom:1px solid #1e1e2e}
td{padding:11px 14px;border-bottom:1px solid #1a1a2e;color:#e2e8f0}tr:hover td{background:#1a1a2e}
.num{font-family:monospace;color:#a78bfa;font-weight:700}.stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:24px}
.stat-card{background:#1a1a2e;border:1px solid #2a2a3e;border-radius:12px;padding:18px 20px}.stat-label{font-size:11px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}
.stat-value{font-size:24px;font-weight:800;color:#a78bfa}.bar-row{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.bar-label{width:150px;font-size:12px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0}
.bar-track{flex:1;height:8px;background:#1e1e2e;border-radius:4px;overflow:hidden}.bar-fill{height:100%;border-radius:4px}
.bar-val{font-size:12px;font-family:monospace;font-weight:700;color:#a78bfa;min-width:52px;text-align:right;flex-shrink:0}
footer{margin-top:48px;font-size:11px;color:#334155;border-top:1px solid #1e1e2e;padding-top:16px}</style></head><body>
<h1>${title}</h1><div class="period">${period} &nbsp;·&nbsp; Generated ${format(new Date(),'MMM d, yyyy HH:mm')}</div>
${sections.map(s=>`<div class="section"><h2>${s.heading}</h2>${s.html}</div>`).join('')}
<footer>NuAIg Chronos — Confidential &nbsp;·&nbsp; ${format(new Date(),'yyyy')}</footer></body></html>`
}

function bars(items:{name:string;hours:number}[]):string{
  const max=items[0]?.hours||1
  return items.map((it,i)=>`<div class="bar-row"><div class="bar-label">${it.name}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round((it.hours/max)*100)}%;background:${COLORS[i%COLORS.length]}"></div></div><div class="bar-val">${h(it.hours)}</div></div>`).join('')
}

export default function ReportsPage(){
  const {profile,profileReady,canManageProjects}=useAuth()
  const [tab,setTab]=useState<Tab>('overview')
  const [period,setPeriod]=useState<Period>('month')
  const [loading,setLoading]=useState(true)

  const [logs,setLogs]=useState<EnrichedLog[]>([])
  const [projects,setProjects]=useState<ProjectDetail[]>([])
  const [clients,setClients]=useState<ClientDetail[]>([])
  const [profilesData,setProfilesData]=useState<ProfileDetail[]>([])
  const [timesheets,setTimesheets]=useState<TimesheetRow[]>([])
  const [weeklyTrend,setWeeklyTrend]=useState<{week:string;hours:number}[]>([])

  const [selProject,setSelProject]=useState<string|null>(null)
  const [selClient,setSelClient]=useState<string|null>(null)
  const [selEmployee,setSelEmployee]=useState<string|null>(null)

  const {start:pStart,end:pEnd}=useMemo(()=>getPeriodRange(period),[period])
  const startStr=format(pStart,'yyyy-MM-dd')
  const endStr=format(pEnd,'yyyy-MM-dd')

  const fetchData=useCallback(async()=>{
    if(!profile)return
    setLoading(true)
    try{
      let logsQ=supabase.from('time_logs').select('hours,log_date,project_id,user_id,task_type_id').gte('log_date',startStr).lte('log_date',endStr)
      if(!canManageProjects)logsQ=logsQ.eq('user_id',profile.id)
      const{data:rawLogs}=await logsQ
      const raw=(rawLogs||[]) as RawLog[]

      const projIds=Object.keys(raw.reduce((m,l)=>{m[l.project_id]=true;return m},{} as Record<string,true>))
      const userIds=Object.keys(raw.reduce((m,l)=>{m[l.user_id]=true;return m},{} as Record<string,true>))
      const ttIds=Object.keys(raw.reduce((m,l)=>{if(l.task_type_id)m[l.task_type_id]=true;return m},{} as Record<string,true>))

      const[projRes,profRes,ttRes]=await Promise.all([
        projIds.length?supabase.from('projects').select('id,name,status,client_id,estimated_hours').in('id',projIds):{data:[]},
        userIds.length?supabase.from('profiles').select('id,full_name,department,manager_id').in('id',userIds):{data:[]},
        ttIds.length?supabase.from('task_types').select('id,name,department').in('id',ttIds):{data:[]},
      ])

      const projArr=(projRes.data||[]) as ProjectDetail[]
      const profArr=(profRes.data||[]) as ProfileDetail[]
      const ttArr=(ttRes.data||[]) as TaskTypeDetail[]
      setProjects(projArr);setProfilesData(profArr)

      const projMap:Record<string,ProjectDetail>={}; for(const p of projArr)projMap[p.id]=p
      const profMap:Record<string,ProfileDetail>={}; for(const p of profArr)profMap[p.id]=p
      const ttMap:Record<string,TaskTypeDetail>={};   for(const t of ttArr)ttMap[t.id]=t

      const clientIds=Object.keys(projArr.reduce((m,p)=>{if(p.client_id)m[p.client_id]=true;return m},{} as Record<string,true>))
      const clientArr:ClientDetail[]=[]
      if(clientIds.length){const{data:cd}=await supabase.from('clients').select('id,name').in('id',clientIds);clientArr.push(...((cd||[]) as ClientDetail[]))}
      setClients(clientArr)
      const clientMap:Record<string,ClientDetail>={};for(const c of clientArr)clientMap[c.id]=c

      const enriched:EnrichedLog[]=raw.map(l=>{
        const proj=projMap[l.project_id],prof=profMap[l.user_id],tt=l.task_type_id?ttMap[l.task_type_id]:null,client=proj?.client_id?clientMap[proj.client_id]:null
        return{...l,projectName:proj?.name||'Unknown',clientId:proj?.client_id??null,clientName:client?.name||'No Client',userName:prof?.full_name||'Unknown',department:prof?.department||'Unassigned',taskTypeName:tt?.name||'Unlogged'}
      })
      setLogs(enriched)

      const trendEnd=pEnd>new Date()?new Date():pEnd
      const weeks=eachWeekOfInterval({start:subWeeks(trendEnd,7),end:trendEnd},{weekStartsOn:1})
      setWeeklyTrend(weeks.map(ws=>{
        const wE=endOfWeek(ws,{weekStartsOn:1}),wS=format(ws,'yyyy-MM-dd'),wES=format(wE,'yyyy-MM-dd')
        return{week:format(ws,'MMM d'),hours:parseFloat(sumH(enriched.filter(l=>l.log_date>=wS&&l.log_date<=wES)).toFixed(1))}
      }))

      let tsQ=supabase.from('timesheets').select('id,user_id,week_start_date,week_end_date,status,total_hours,submitted_at').gte('week_start_date',startStr).lte('week_start_date',endStr).order('week_start_date',{ascending:false})
      if(!canManageProjects)tsQ=tsQ.eq('user_id',profile.id)
      const{data:tsRaw}=await tsQ
      const tsArr=(tsRaw||[]) as Omit<TimesheetRow,'userName'>[]
      const tsUids=Object.keys(tsArr.reduce((m,t)=>{m[t.user_id]=true;return m},{} as Record<string,true>))
      const tsNameMap:Record<string,string>={}
      if(tsUids.length){const{data:td}=await supabase.from('profiles').select('id,full_name').in('id',tsUids);for(const p of(td||[]) as{id:string;full_name:string}[])tsNameMap[p.id]=p.full_name}
      setTimesheets(tsArr.map(t=>({...t,userName:tsNameMap[t.user_id]||'Unknown'})))
    }catch(e){console.error(e);toast.error('Failed to load report data')}finally{setLoading(false)}
  },[profileReady,profile?.id,startStr,endStr,canManageProjects])

  useEffect(()=>{if(profileReady)fetchData()},[profileReady,fetchData])
  useEffect(()=>{setSelProject(null);setSelClient(null);setSelEmployee(null)},[tab,period])

  const totalHours=useMemo(()=>sumH(logs),[logs])
  const uProjects=useMemo(()=>new Set(logs.map(l=>l.project_id)).size,[logs])
  const uPeople=useMemo(()=>new Set(logs.map(l=>l.user_id)).size,[logs])
  const activeDays=useMemo(()=>new Set(logs.map(l=>l.log_date)).size,[logs])
  const avgPerDay=activeDays>0?totalHours/activeDays:0
  const deptData=useMemo(()=>{const m:Record<string,number>={};for(const l of logs)m[l.department]=(m[l.department]||0)+l.hours;return Object.entries(m).map(([name,hours])=>({name,hours:parseFloat(hours.toFixed(1))})).sort((a,b)=>b.hours-a.hours)},[logs])
  const statusCounts=useMemo(()=>timesheets.reduce((m,t)=>{m[t.status]=(m[t.status]||0)+1;return m},{} as Record<string,number>),[timesheets])
  const pl=pLabel(period,pStart,pEnd)

  const tabSt=(t:Tab):React.CSSProperties=>({padding:'8px 18px',borderRadius:'8px',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:600,fontFamily:'var(--font-display)',background:tab===t?ACCENT:'transparent',color:tab===t?'#0f0f17':'var(--chronos-text-muted)',transition:'all 0.15s'})
  const perSt=(p:Period):React.CSSProperties=>({padding:'6px 14px',borderRadius:'6px',border:`1px solid ${period===p?ACCENT:'var(--chronos-border)'}`,cursor:'pointer',fontSize:'12px',fontWeight:600,background:period===p?'rgba(167,139,250,0.12)':'transparent',color:period===p?ACCENT:'var(--chronos-text-muted)',transition:'all 0.15s'})

  const exportReport=()=>{
    let html=''
    const title=tab==='overview'?'Overview Report':tab==='projects'&&selProject?`Project — ${projects.find(p=>p.id===selProject)?.name||''}`:tab==='projects'?'Projects Report':tab==='clients'&&selClient?`Client — ${clients.find(c=>c.id===selClient)?.name||''}`:tab==='clients'?'Clients Report':selEmployee?`Employee — ${profilesData.find(p=>p.id===selEmployee)?.full_name||''}` : 'Employees Report'

    if(tab==='overview'){
      const topP=Object.entries(gby(logs,l=>l.projectName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours).slice(0,10)
      html=buildHTML(title,pl,[
        {heading:'Key Metrics',html:`<div class="stat-grid"><div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${h(totalHours)}</div></div><div class="stat-card"><div class="stat-label">Projects</div><div class="stat-value">${uProjects}</div></div><div class="stat-card"><div class="stat-label">Contributors</div><div class="stat-value">${uPeople}</div></div><div class="stat-card"><div class="stat-label">Avg/Active Day</div><div class="stat-value">${h(avgPerDay)}</div></div></div>`},
        {heading:'Hours by Project',html:bars(topP)},
        {heading:'Hours by Department',html:bars(deptData)},
        {heading:'Timesheet Status',html:`<table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>${['draft','submitted','approved','rejected'].map(s=>`<tr><td style="text-transform:capitalize">${s}</td><td class="num">${statusCounts[s]||0}</td></tr>`).join('')}</tbody></table>`},
      ])
    } else if(tab==='projects'){
      const proj=selProject?projects.find(p=>p.id===selProject):null
      if(proj&&selProject){
        const pl2=logs.filter(l=>l.project_id===selProject)
        const totalPH=sumH(pl2)
        const byTask=Object.entries(gby(pl2,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        const byDept=Object.entries(gby(pl2,l=>l.department)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        const byPerson=Object.entries(gby(pl2,l=>l.user_id)).map(([_,ls])=>({name:ls[0].userName,dept:ls[0].department,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        html=buildHTML(title,pl,[
          {heading:'Overview',html:`<div class="stat-grid"><div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${h(totalPH)}</div></div><div class="stat-card"><div class="stat-label">Est. Hours</div><div class="stat-value">${proj.estimated_hours?h(proj.estimated_hours):'—'}</div></div><div class="stat-card"><div class="stat-label">Team Size</div><div class="stat-value">${byPerson.length}</div></div><div class="stat-card"><div class="stat-label">Budget Used</div><div class="stat-value">${proj.estimated_hours?Math.round((totalPH/proj.estimated_hours)*100)+'%':'—'}</div></div></div>`},
          {heading:'Hours by Task Type',html:bars(byTask)},
          {heading:'Hours by Department',html:bars(byDept)},
          {heading:'Team Contributions',html:`<table><thead><tr><th>Name</th><th>Department</th><th>Hours</th><th>Share</th></tr></thead><tbody>${byPerson.map(p=>`<tr><td>${p.name}</td><td>${p.dept}</td><td class="num">${h(p.hours)}</td><td class="num">${totalPH>0?Math.round((p.hours/totalPH)*100):0}%</td></tr>`).join('')}</tbody></table>`},
        ])
      } else {
        const ps=projects.map(p=>{const pl2=logs.filter(l=>l.project_id===p.id);const client=clients.find(c=>c.id===p.client_id);return{...p,clientName:client?.name||'—',hours:sumH(pl2),people:new Set(pl2.map(l=>l.user_id)).size}}).sort((a,b)=>b.hours-a.hours)
        html=buildHTML(title,pl,[{heading:'All Projects',html:`<table><thead><tr><th>Project</th><th>Client</th><th>Status</th><th>Hours</th><th>Budget</th><th>People</th></tr></thead><tbody>${ps.map(p=>{const pct=p.estimated_hours?Math.round((p.hours/p.estimated_hours)*100):null;return`<tr><td>${p.name}</td><td>${p.clientName}</td><td style="text-transform:capitalize">${p.status}</td><td class="num">${h(p.hours)}</td><td class="num">${pct!=null?pct+'%':'—'}</td><td class="num">${p.people}</td></tr>`}).join('')}</tbody></table>`}])
      }
    } else if(tab==='clients'){
      const client=selClient?clients.find(c=>c.id===selClient):null
      if(client&&selClient){
        const cl=logs.filter(l=>l.clientId===selClient),totalCH=sumH(cl)
        const byProj=Object.entries(gby(cl,l=>l.projectName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        const byPerson=Object.entries(gby(cl,l=>l.user_id)).map(([_,ls])=>({name:ls[0].userName,dept:ls[0].department,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        const byTask=Object.entries(gby(cl,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
        html=buildHTML(title,pl,[
          {heading:'Overview',html:`<div class="stat-grid"><div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${h(totalCH)}</div></div><div class="stat-card"><div class="stat-label">Projects</div><div class="stat-value">${byProj.length}</div></div><div class="stat-card"><div class="stat-label">Contributors</div><div class="stat-value">${byPerson.length}</div></div></div>`},
          {heading:'Hours by Project',html:bars(byProj)},
          {heading:'Effort by Task Type',html:bars(byTask)},
          {heading:'Team',html:`<table><thead><tr><th>Name</th><th>Department</th><th>Hours</th><th>Share</th></tr></thead><tbody>${byPerson.map(p=>`<tr><td>${p.name}</td><td>${p.dept}</td><td class="num">${h(p.hours)}</td><td class="num">${totalCH>0?Math.round((p.hours/totalCH)*100):0}%</td></tr>`).join('')}</tbody></table>`},
        ])
      } else {
        const cs=clients.map(c=>{const cl=logs.filter(l=>l.clientId===c.id);return{...c,hours:sumH(cl),projs:new Set(cl.map(l=>l.project_id)).size,people:new Set(cl.map(l=>l.user_id)).size}}).sort((a,b)=>b.hours-a.hours)
        html=buildHTML(title,pl,[{heading:'All Clients',html:`<table><thead><tr><th>Client</th><th>Hours</th><th>Projects</th><th>People</th></tr></thead><tbody>${cs.map(c=>`<tr><td>${c.name}</td><td class="num">${h(c.hours)}</td><td class="num">${c.projs}</td><td class="num">${c.people}</td></tr>`).join('')}</tbody></table>`}])
      }
    } else if(tab==='employees'&&selEmployee){
      const emp=profilesData.find(p=>p.id===selEmployee)
      const el=logs.filter(l=>l.user_id===selEmployee),totalEH=sumH(el)
      const byProj=Object.entries(gby(el,l=>l.projectName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
      const byTask=Object.entries(gby(el,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
      const ewks=eachWeekOfInterval({start:pStart,end:pEnd>new Date()?new Date():pEnd},{weekStartsOn:1})
      const wRows=ewks.map(ws=>{const wE=endOfWeek(ws,{weekStartsOn:1}),wS=format(ws,'yyyy-MM-dd'),wES=format(wE,'yyyy-MM-dd');return{week:`${format(ws,'MMM d')}–${format(wE,'MMM d')}`,hours:parseFloat(sumH(el.filter(l=>l.log_date>=wS&&l.log_date<=wES)).toFixed(1))}})
      const empTS=timesheets.filter(t=>t.user_id===selEmployee)
      html=buildHTML(title,pl,[
        {heading:'Overview',html:`<div class="stat-grid"><div class="stat-card"><div class="stat-label">Total Hours</div><div class="stat-value">${h(totalEH)}</div></div><div class="stat-card"><div class="stat-label">Department</div><div class="stat-value" style="font-size:16px">${emp?.department||'—'}</div></div><div class="stat-card"><div class="stat-label">Projects</div><div class="stat-value">${byProj.length}</div></div><div class="stat-card"><div class="stat-label">Active Days</div><div class="stat-value">${new Set(el.map(l=>l.log_date)).size}</div></div></div>`},
        {heading:'Weekly Hours',html:`<table><thead><tr><th>Week</th><th>Hours</th></tr></thead><tbody>${wRows.map(w=>`<tr><td>${w.week}</td><td class="num">${h(w.hours)}</td></tr>`).join('')}</tbody></table>`},
        {heading:'By Project',html:bars(byProj)},
        {heading:'By Task Type',html:bars(byTask)},
        {heading:'Timesheets',html:`<table><thead><tr><th>Week</th><th>Status</th><th>Hours</th><th>Submitted</th></tr></thead><tbody>${empTS.map(t=>`<tr><td>${format(new Date(t.week_start_date+'T00:00:00'),'MMM d')}–${format(new Date(t.week_end_date+'T00:00:00'),'MMM d, yyyy')}</td><td style="text-transform:capitalize">${t.status}</td><td class="num">${h(t.total_hours)}</td><td>${t.submitted_at?format(new Date(t.submitted_at),'MMM d HH:mm'):'—'}</td></tr>`).join('')}</tbody></table>`},
      ])
    } else {
      toast('Drill into a record for a detailed export, or view the list tab for a summary export');return
    }
    const blob=new Blob([html],{type:'text/html;charset=utf-8'})
    const url=URL.createObjectURL(blob)
    const a=document.createElement('a');a.href=url;a.download=`${title.replace(/[^a-z0-9]/gi,'_')}_${period}_${format(new Date(),'yyyy-MM-dd')}.html`;a.click();URL.revokeObjectURL(url)
    toast.success('Report downloaded — open in browser to print or share')
  }

  // ─── OVERVIEW ────────────────────────────────────────────────────────────
  const OverviewTab=()=>{
    const topProjects=useMemo(()=>Object.entries(gby(logs,l=>l.projectName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours).slice(0,10),[])
    return(
      <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'14px'}}>
          <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalHours)} sub={pl}/>
          <SCard icon={<FolderKanban size={20}/>} label="Active Projects" value={uProjects} sub="with logged time" color="#60a5fa"/>
          <SCard icon={<Users size={20}/>} label="Contributors" value={uPeople} sub="team members" color="#34d399"/>
          <SCard icon={<TrendingUp size={20}/>} label="Avg / Active Day" value={h(avgPerDay)} sub={`${activeDays} active days`} color="#fbbf24"/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:'16px'}}>
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Weekly Hours Trend" sub="Last 8 weeks"/>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={weeklyTrend} margin={{top:4,right:4,bottom:0,left:-10}}>
                <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT} stopOpacity={0.3}/><stop offset="95%" stopColor={ACCENT} stopOpacity={0}/></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/><XAxis dataKey="week" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/><Area type="monotone" dataKey="hours" stroke={ACCENT} strokeWidth={2} fill="url(#ag)" dot={{fill:ACCENT,r:3,strokeWidth:0}}/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="By Department"/>
            {deptData.length===0?<div style={{textAlign:'center',color:'var(--chronos-text-muted)',fontSize:'13px',paddingTop:'60px'}}>No data</div>:<>
              <ResponsiveContainer width="100%" height={150}><PieChart><Pie data={deptData} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={68} paddingAngle={3}>{deptData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/></PieChart></ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',gap:'7px',marginTop:'8px'}}>{deptData.map((d,i)=><div key={d.name} style={{display:'flex',alignItems:'center',gap:'8px'}}><div style={{width:'8px',height:'8px',borderRadius:'2px',background:COLORS[i%COLORS.length],flexShrink:0}}/><span style={{fontSize:'12px',color:'var(--chronos-text-muted)',flex:1}}>{d.name}</span><span style={{fontSize:'12px',fontFamily:'var(--font-mono)',color:'var(--chronos-text)',fontWeight:600}}>{h(d.hours)}</span></div>)}</div>
            </>}
          </div>
        </div>
        {topProjects.length>0&&<div className="card-base" style={{padding:'20px'}}>
          <SecTitle title="Top Projects by Hours" sub="Click a bar to drill into project detail"/>
          <ResponsiveContainer width="100%" height={Math.max(180,topProjects.length*38)}>
            <BarChart data={topProjects} layout="vertical" margin={{top:0,right:16,bottom:0,left:110}} onClick={d=>d?.activePayload&&(setTab('projects'),setSelProject(projects.find(p=>p.name===d.activePayload![0].payload.name)?.id||null))}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false}/><XAxis type="number" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={{fontSize:12,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={106}/>
              <Tooltip {...TT} formatter={(v:number)=>[`${v.toFixed(1)}h`,'Hours']} cursor={{fill:'rgba(167,139,250,0.06)',cursor:'pointer'}}/><Bar dataKey="hours" radius={[0,6,6,0]} style={{cursor:'pointer'}}>{topProjects.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>}
        <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'16px'}}>
          <div className="card-base" style={{padding:'20px',minWidth:'240px'}}>
            <SecTitle title="Timesheets"/>
            <div style={{display:'flex',flexDirection:'column',gap:'12px',marginTop:'4px'}}>
              {(['approved','submitted','rejected','draft'] as const).map(s=>(
                <div key={s} style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:STATUS_COLORS[s],flexShrink:0}}/><span style={{fontSize:'13px',color:'var(--chronos-text-muted)',flex:1,textTransform:'capitalize'}}>{s}</span><span style={{fontFamily:'var(--font-mono)',fontSize:'16px',fontWeight:800,color:STATUS_COLORS[s]}}>{statusCounts[s]||0}</span>
                </div>
              ))}
            </div>
          </div>
          {canManageProjects&&<div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Team Hours"/>
            <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
              {logs.length===0?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px'}}>No data</div>:
                Object.entries(gby(logs,l=>l.user_id)).map(([uid,ls])=>({name:ls[0].userName,hours:sumH(ls)})).sort((a,b)=>b.hours-a.hours).slice(0,8).map((e,i,arr)=><MiniBar key={e.name} label={e.name} value={e.hours} max={arr[0]?.hours||1} color={COLORS[i%COLORS.length]}/>)
              }
            </div>
          </div>}
        </div>
      </div>
    )
  }

  // ─── PROJECTS ────────────────────────────────────────────────────────────
  const ProjectsTab=()=>{
    const proj=projects.find(p=>p.id===selProject)
    const projLogs=selProject?logs.filter(l=>l.project_id===selProject):[]
    const totalPH=sumH(projLogs)

    // ── list ──
    if(!selProject){
      const ps=projects.map(p=>{
        const pl2=logs.filter(l=>l.project_id===p.id)
        const client=clients.find(c=>c.id===p.client_id)
        return{...p,clientName:client?.name||'No client',hours:sumH(pl2),
          people:Object.keys(pl2.reduce((m,l)=>{m[l.user_id]=true;return m},{} as Record<string,true>)).length}
      }).sort((a,b)=>b.hours-a.hours)
      const maxH=ps[0]?.hours||1
      return(
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'14px'}}>
            <SCard icon={<FolderKanban size={20}/>} label="Projects" value={ps.length}/>
            <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalHours)} color="#60a5fa"/>
            <SCard icon={<Users size={20}/>} label="Contributors" value={uPeople} color="#34d399"/>
          </div>
          {ps.length===0
            ?<div className="card-base" style={{padding:'60px',textAlign:'center',color:'var(--chronos-text-muted)',fontSize:'14px'}}>No project data for this period</div>
            :<>
              {/* bar chart */}
              <div className="card-base" style={{padding:'20px'}}>
                <SecTitle title="Hours per Project" sub="Click a bar or row to open project detail"/>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={ps.slice(0,12)} margin={{top:4,right:4,bottom:32,left:-10}}
                    onClick={d=>d?.activePayload&&setSelProject(ps.find(p=>p.name===d.activePayload![0].payload.name)?.id||null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} interval={0} angle={-25} textAnchor="end"/>
                    <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <Tooltip {...TT} formatter={(v:number)=>[`${v.toFixed(1)}h`,'Hours']} cursor={{fill:'rgba(167,139,250,0.08)',cursor:'pointer'}}/>
                    <Bar dataKey="hours" radius={[6,6,0,0]} style={{cursor:'pointer'}}>
                      {ps.slice(0,12).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* project list */}
              <div className="card-base" style={{overflow:'hidden'}}>
                <div style={{padding:'12px 20px',borderBottom:'1px solid var(--chronos-border)',display:'grid',gridTemplateColumns:'1fr 130px 80px 90px 120px 60px',gap:'10px'}}>
                  {['Project','Client','Status','Hours','Budget Used','Team'].map(hd=><span key={hd} style={{fontSize:'11px',fontWeight:700,color:'var(--chronos-text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{hd}</span>)}
                </div>
                {ps.map((p,i)=>{
                  const pct=p.estimated_hours?Math.round((p.hours/p.estimated_hours)*100):null
                  const barW=pct!=null?Math.min(pct,100):0
                  const barC=pct!=null&&pct>100?'#f87171':pct!=null&&pct>80?'#fbbf24':ACCENT
                  return(
                    <div key={p.id} className="table-row" onClick={()=>setSelProject(p.id)}
                      style={{padding:'12px 20px',display:'grid',gridTemplateColumns:'1fr 130px 80px 90px 120px 60px',gap:'10px',alignItems:'center',borderBottom:i<ps.length-1?'1px solid var(--chronos-border)':'none',cursor:'pointer'}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <div style={{width:'8px',height:'8px',borderRadius:'50%',background:COLORS[i%COLORS.length],flexShrink:0}}/>
                        <span style={{fontWeight:600,fontSize:'13px',color:'var(--chronos-text)'}}>{p.name}</span>
                      </div>
                      <span style={{fontSize:'12px',color:'var(--chronos-text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.clientName}</span>
                      <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'100px',background:'var(--chronos-surface-2)',color:'var(--chronos-text-muted)',textTransform:'capitalize',width:'fit-content'}}>{p.status}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',fontWeight:700,color:ACCENT}}>{h(p.hours)}</span>
                      <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                        {pct!=null?<><div style={{flex:1,height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${barW}%`,background:barC,borderRadius:'3px'}}/></div><span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flexShrink:0,minWidth:'32px'}}>{pct}%</span></>:<span style={{fontSize:'12px',color:'var(--chronos-text-muted)'}}>—</span>}
                      </div>
                      <span style={{fontSize:'13px',color:'var(--chronos-text-muted)'}}>{p.people}</span>
                    </div>
                  )
                })}
              </div>
            </>
          }
        </div>
      )
    }

    // ── project detail ──
    const byTask=Object.entries(gby(projLogs,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1)),pct:0})).sort((a,b)=>b.hours-a.hours).map(t=>({...t,pct:totalPH>0?Math.round((t.hours/totalPH)*100):0}))
    const byDept=Object.entries(gby(projLogs,l=>l.department)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
    const byPerson=Object.entries(gby(projLogs,l=>l.user_id)).map(([uid,ls])=>({id:uid,name:ls[0].userName,dept:ls[0].department,hours:parseFloat(sumH(ls).toFixed(1)),pct:0,taskBreakdown:Object.entries(gby(ls,l=>l.taskTypeName)).map(([tn,tls])=>({name:tn,hours:parseFloat(sumH(tls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)})).sort((a,b)=>b.hours-a.hours).map(p=>({...p,pct:totalPH>0?Math.round((p.hours/totalPH)*100):0}))
    const wkly=eachWeekOfInterval({start:pStart,end:pEnd>new Date()?new Date():pEnd},{weekStartsOn:1}).map(w=>{const wE=endOfWeek(w,{weekStartsOn:1}),wS=format(w,'yyyy-MM-dd'),wES=format(wE,'yyyy-MM-dd');return{week:format(w,'MMM d'),hours:parseFloat(sumH(projLogs.filter(l=>l.log_date>=wS&&l.log_date<=wES)).toFixed(1))}})
    const estH=proj?.estimated_hours,burnPct=estH?Math.round((totalPH/estH)*100):null
    const activeDaysP=Object.keys(projLogs.reduce((m,l)=>{m[l.log_date]=true;return m},{} as Record<string,true>)).length
    const clientName=clients.find(c=>c.id===proj?.client_id)?.name||'No client'

    return(
      <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
        {/* back + heading */}
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button onClick={()=>setSelProject(null)} className="btn-secondary" style={{padding:'7px 12px',gap:'6px'}}><ArrowLeft size={13}/> All Projects</button>
          <div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:800}}>{proj?.name}</div>
            <div style={{fontSize:'12px',color:'var(--chronos-text-muted)',marginTop:'2px'}}>{clientName} · {pl}</div>
          </div>
          <div style={{marginLeft:'auto'}}><span style={{fontSize:'11px',padding:'3px 10px',borderRadius:'100px',background:'var(--chronos-surface-2)',color:'var(--chronos-text-muted)',textTransform:'capitalize',border:'1px solid var(--chronos-border)'}}>{proj?.status}</span></div>
        </div>

        {/* KPI row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'12px'}}>
          <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalPH)}/>
          <SCard icon={<FolderKanban size={20}/>} label="Est. Hours" value={estH?h(estH):'—'} color="#60a5fa"/>
          <SCard icon={<Users size={20}/>} label="Team Size" value={byPerson.length} color="#34d399"/>
          <SCard icon={<Layers size={20}/>} label="Budget Used" value={burnPct!=null?`${burnPct}%`:'—'} color={burnPct&&burnPct>100?'#f87171':burnPct&&burnPct>80?'#fbbf24':'#34d399'} sub={estH?`of ${h(estH)}`:undefined}/>
          <SCard icon={<Calendar size={20}/>} label="Active Days" value={activeDaysP} color="#e879f9"/>
        </div>

        {/* Weekly trend */}
        <div className="card-base" style={{padding:'20px'}}>
          <SecTitle title="Weekly Hours Trend" sub="Hours logged per week across the selected period"/>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={wkly} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
              <XAxis dataKey="week" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
              <Bar dataKey="hours" radius={[6,6,0,0]}>{wkly.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task type + dept side by side */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>

          {/* Task type — full chart + table */}
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Task Type" sub="What kind of work was done on this project"/>
            {byTask.length===0
              ?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px',padding:'20px 0'}}>No task type data logged yet</div>
              :<>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byTask} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={2} label={({name,pct})=>`${pct}%`} labelLine={false}>
                      {byTask.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexDirection:'column',gap:'0px',marginTop:'8px',borderTop:'1px solid var(--chronos-border)'}}>
                  {byTask.map((t,i)=>(
                    <div key={t.name} style={{display:'grid',gridTemplateColumns:'14px 1fr 52px 52px',gap:'8px',alignItems:'center',padding:'8px 4px',borderBottom:i<byTask.length-1?'1px solid var(--chronos-border)':''  }}>
                      <div style={{width:'10px',height:'10px',borderRadius:'3px',background:COLORS[i%COLORS.length]}}/>
                      <span style={{fontSize:'12px',color:'var(--chronos-text)',fontWeight:500}}>{t.name}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color:ACCENT,textAlign:'right'}}>{h(t.hours)}</span>
                      <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',textAlign:'right'}}>{t.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            }
          </div>

          {/* Department breakdown */}
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Department" sub="Which teams contributed to this project"/>
            {byDept.length===0
              ?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px',padding:'20px 0'}}>No department data</div>
              :<>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={byDept} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3}>
                      {byDept.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'8px'}}>
                  {byDept.map((d,i)=>{
                    const pct=totalPH>0?Math.round((d.hours/totalPH)*100):0
                    return(
                      <div key={d.name}>
                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'2px',background:COLORS[i%COLORS.length]}}/><span style={{fontSize:'12px',color:'var(--chronos-text)',fontWeight:500}}>{d.name}</span></div>
                          <div style={{display:'flex',gap:'10px',alignItems:'center'}}><span style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color:ACCENT}}>{h(d.hours)}</span><span style={{fontSize:'11px',color:'var(--chronos-text-muted)',minWidth:'30px',textAlign:'right'}}>{pct}%</span></div>
                        </div>
                        <div style={{height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                      </div>
                    )
                  })}
                </div>
              </>
            }
          </div>
        </div>

        {/* Per-department task type chart */}
        {byDept.length>1&&(()=>{
          const deptTaskData=byDept.map(d=>{
            const dl=projLogs.filter(l=>l.department===d.name)
            const row:Record<string,string|number>={dept:d.name}
            Object.entries(gby(dl,l=>l.taskTypeName)).forEach(([tn,ls])=>{row[tn]=parseFloat(sumH(ls).toFixed(1))})
            return row
          })
          const allTaskNames=Object.keys(projLogs.reduce((m,l)=>{m[l.taskTypeName]=true;return m},{} as Record<string,true>))
          return(
            <div className="card-base" style={{padding:'20px'}}>
              <SecTitle title="Task Type Distribution by Department" sub="Stacked view showing how each department spent hours across task types"/>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={deptTaskData} margin={{top:4,right:4,bottom:0,left:-10}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
                  <XAxis dataKey="dept" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                  <Tooltip {...TT} cursor={{fill:'rgba(167,139,250,0.06)'}}/>
                  {allTaskNames.map((tn,i)=><Bar key={tn} dataKey={tn} stackId="a" fill={COLORS[i%COLORS.length]} radius={i===allTaskNames.length-1?[4,4,0,0]:[0,0,0,0]}/>)}
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexWrap:'wrap',gap:'12px',marginTop:'12px'}}>
                {allTaskNames.map((tn,i)=><div key={tn} style={{display:'flex',alignItems:'center',gap:'5px'}}><div style={{width:'10px',height:'10px',borderRadius:'2px',background:COLORS[i%COLORS.length]}}/><span style={{fontSize:'11px',color:'var(--chronos-text-muted)'}}>{tn}</span></div>)}
              </div>
            </div>
          )
        })()}

        {/* Team contributions — each person + their task breakdown */}
        <div className="card-base" style={{overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--chronos-border)'}}>
            <SecTitle title="Team Contributions" sub="Each contributor, their department, total hours, project share, and task breakdown"/>
          </div>
          {byPerson.map((p,i)=>(
            <div key={p.id} style={{padding:'16px 20px',borderBottom:i<byPerson.length-1?'1px solid var(--chronos-border)':'none'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 120px 90px 120px',gap:'12px',alignItems:'center',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'32px',height:'32px',borderRadius:'10px',background:`linear-gradient(135deg,${COLORS[i%COLORS.length]},${COLORS[(i+2)%COLORS.length]})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'white',flexShrink:0}}>{p.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                  <div><div style={{fontWeight:600,fontSize:'13px',color:'var(--chronos-text)'}}>{p.name}</div><div style={{fontSize:'11px',color:'var(--chronos-text-muted)'}}>{p.dept||'—'}</div></div>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'14px',fontWeight:800,color:ACCENT}}>{h(p.hours)}</span>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{flex:1,height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${p.pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                  <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flexShrink:0}}>{p.pct}%</span>
                </div>
                <span style={{fontSize:'11px',color:'var(--chronos-text-muted)'}}>of project</span>
              </div>
              {/* task mini-bars for this person */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'6px 20px',paddingLeft:'42px'}}>
                {p.taskBreakdown.map((t,j)=>{
                  const tpct=p.hours>0?Math.round((t.hours/p.hours)*100):0
                  return(
                    <div key={t.name} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{width:'6px',height:'6px',borderRadius:'2px',background:COLORS[j%COLORS.length],flexShrink:0}}/>
                      <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'11px',color:'var(--chronos-text)',fontWeight:600,flexShrink:0}}>{h(t.hours)}</span>
                      <span style={{fontSize:'10px',color:'var(--chronos-text-muted)',flexShrink:0,minWidth:'28px',textAlign:'right'}}>{tpct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }


  // ─── CLIENTS ─────────────────────────────────────────────────────────────
  const ClientsTab=()=>{
    const client=clients.find(c=>c.id===selClient)
    const cLogs=selClient?logs.filter(l=>l.clientId===selClient):[]
    const totalCH=sumH(cLogs)
    const cSummary=clients.map(c=>{
      const cl=logs.filter(l=>l.clientId===c.id)
      return{...c,hours:sumH(cl),
        projects:Object.keys(cl.reduce((m,l)=>{m[l.project_id]=true;return m},{} as Record<string,true>)).length,
        people:Object.keys(cl.reduce((m,l)=>{m[l.user_id]=true;return m},{} as Record<string,true>)).length}
    }).sort((a,b)=>b.hours-a.hours)

    // ── list ──
    if(!selClient){
      return(
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'14px'}}>
            <SCard icon={<Building2 size={20}/>} label="Clients" value={clients.length}/>
            <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalHours)} color="#60a5fa"/>
            <SCard icon={<FolderKanban size={20}/>} label="Client Projects" value={uProjects} color="#34d399"/>
          </div>
          {cSummary.length===0
            ?<div className="card-base" style={{padding:'60px',textAlign:'center',color:'var(--chronos-text-muted)',fontSize:'14px'}}>No client data for this period</div>
            :<>
              <div className="card-base" style={{padding:'20px'}}>
                <SecTitle title="Hours per Client" sub="Click a bar or row to open client detail"/>
                <ResponsiveContainer width="100%" height={Math.max(180,cSummary.length*48)}>
                  <BarChart data={cSummary} layout="vertical" margin={{top:0,right:16,bottom:0,left:100}}
                    onClick={d=>d?.activePayload&&setSelClient(cSummary.find(c=>c.name===d.activePayload![0].payload.name)?.id||null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID} horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:12,fill:'#94a3b8'}} axisLine={false} tickLine={false} width={96}/>
                    <Tooltip {...TT} formatter={(v:number)=>[`${v.toFixed(1)}h`,'Hours']} cursor={{fill:'rgba(167,139,250,0.06)',cursor:'pointer'}}/>
                    <Bar dataKey="hours" radius={[0,6,6,0]} style={{cursor:'pointer'}}>
                      {cSummary.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="card-base" style={{overflow:'hidden'}}>
                <div style={{padding:'12px 20px',borderBottom:'1px solid var(--chronos-border)',display:'grid',gridTemplateColumns:'1fr 100px 90px 90px',gap:'12px'}}>
                  {['Client','Hours','Projects','People'].map(hd=><span key={hd} style={{fontSize:'11px',fontWeight:700,color:'var(--chronos-text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{hd}</span>)}
                </div>
                {cSummary.map((c,i)=>(
                  <div key={c.id} className="table-row" onClick={()=>setSelClient(c.id)}
                    style={{padding:'13px 20px',display:'grid',gridTemplateColumns:'1fr 100px 90px 90px',gap:'12px',alignItems:'center',borderBottom:i<cSummary.length-1?'1px solid var(--chronos-border)':'none',cursor:'pointer'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:'32px',height:'32px',borderRadius:'10px',background:`${COLORS[i%COLORS.length]}25`,display:'flex',alignItems:'center',justifyContent:'center',color:COLORS[i%COLORS.length],fontSize:'14px',fontWeight:800,flexShrink:0}}>{c.name[0].toUpperCase()}</div>
                      <span style={{fontWeight:600,fontSize:'13px',color:'var(--chronos-text)'}}>{c.name}</span>
                    </div>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',fontWeight:700,color:ACCENT}}>{h(c.hours)}</span>
                    <span style={{fontSize:'13px',color:'var(--chronos-text-muted)'}}>{c.projects}</span>
                    <span style={{fontSize:'13px',color:'var(--chronos-text-muted)'}}>{c.people}</span>
                  </div>
                ))}
              </div>
            </>
          }
        </div>
      )
    }

    // ── client detail ──
    const byProj=Object.entries(gby(cLogs,l=>l.project_id)).map(([pid,ls])=>({id:pid,name:ls[0].projectName,hours:parseFloat(sumH(ls).toFixed(1)),pct:0,taskBreakdown:Object.entries(gby(ls,l=>l.taskTypeName)).map(([tn,tls])=>({name:tn,hours:parseFloat(sumH(tls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)})).sort((a,b)=>b.hours-a.hours).map(p=>({...p,pct:totalCH>0?Math.round((p.hours/totalCH)*100):0}))
    const byTask=Object.entries(gby(cLogs,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1)),pct:0})).sort((a,b)=>b.hours-a.hours).map(t=>({...t,pct:totalCH>0?Math.round((t.hours/totalCH)*100):0}))
    const byDept=Object.entries(gby(cLogs,l=>l.department)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)
    const byPerson=Object.entries(gby(cLogs,l=>l.user_id)).map(([uid,ls])=>({id:uid,name:ls[0].userName,dept:ls[0].department,hours:parseFloat(sumH(ls).toFixed(1)),pct:0,projectBreakdown:Object.entries(gby(ls,l=>l.projectName)).map(([pn,pls])=>({name:pn,hours:parseFloat(sumH(pls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)})).sort((a,b)=>b.hours-a.hours).map(p=>({...p,pct:totalCH>0?Math.round((p.hours/totalCH)*100):0}))
    const activeDaysC=Object.keys(cLogs.reduce((m,l)=>{m[l.log_date]=true;return m},{} as Record<string,true>)).length
    const wklyC=eachWeekOfInterval({start:pStart,end:pEnd>new Date()?new Date():pEnd},{weekStartsOn:1}).map(w=>{const wE=endOfWeek(w,{weekStartsOn:1}),wS=format(w,'yyyy-MM-dd'),wES=format(wE,'yyyy-MM-dd');return{week:format(w,'MMM d'),hours:parseFloat(sumH(cLogs.filter(l=>l.log_date>=wS&&l.log_date<=wES)).toFixed(1))}})

    return(
      <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
        {/* back + heading */}
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button onClick={()=>setSelClient(null)} className="btn-secondary" style={{padding:'7px 12px',gap:'6px'}}><ArrowLeft size={13}/> All Clients</button>
          <div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:800}}>{client?.name}</div>
            <div style={{fontSize:'12px',color:'var(--chronos-text-muted)',marginTop:'2px'}}>{pl}</div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'12px'}}>
          <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalCH)}/>
          <SCard icon={<FolderKanban size={20}/>} label="Projects" value={byProj.length} color="#60a5fa"/>
          <SCard icon={<Users size={20}/>} label="Contributors" value={byPerson.length} color="#34d399"/>
          <SCard icon={<Building2 size={20}/>} label="Departments" value={byDept.length} color="#fbbf24"/>
          <SCard icon={<Calendar size={20}/>} label="Active Days" value={activeDaysC} color="#e879f9"/>
        </div>

        {/* Weekly trend */}
        <div className="card-base" style={{padding:'20px'}}>
          <SecTitle title="Weekly Hours Trend" sub="Total hours billed to this client per week"/>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={wklyC} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
              <XAxis dataKey="week" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
              <Bar dataKey="hours" radius={[6,6,0,0]}>{wklyC.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task type + Department */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
          {/* Task type pie + table */}
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Task Type" sub="What type of work was delivered to this client"/>
            {byTask.length===0?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px'}}>No task type data</div>:<>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byTask} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={80} paddingAngle={2} label={({pct})=>`${pct}%`} labelLine={false}>
                    {byTask.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',gap:'0',marginTop:'8px',borderTop:'1px solid var(--chronos-border)'}}>
                {byTask.map((t,i)=>(
                  <div key={t.name} style={{display:'grid',gridTemplateColumns:'12px 1fr 52px 44px',gap:'8px',alignItems:'center',padding:'8px 4px',borderBottom:i<byTask.length-1?'1px solid var(--chronos-border)':''}}>
                    <div style={{width:'10px',height:'10px',borderRadius:'3px',background:COLORS[i%COLORS.length]}}/>
                    <span style={{fontSize:'12px',color:'var(--chronos-text)',fontWeight:500}}>{t.name}</span>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color:ACCENT,textAlign:'right'}}>{h(t.hours)}</span>
                    <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',textAlign:'right'}}>{t.pct}%</span>
                  </div>
                ))}
              </div>
            </>}
          </div>

          {/* Department breakdown */}
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Department" sub="Which teams contributed hours to this client"/>
            {byDept.length===0?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px'}}>No department data</div>:<>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={byDept} dataKey="hours" nameKey="name" cx="50%" cy="50%" innerRadius={48} outerRadius={80} paddingAngle={3}>
                    {byDept.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',gap:'8px',marginTop:'8px'}}>
                {byDept.map((d,i)=>{
                  const pct=totalCH>0?Math.round((d.hours/totalCH)*100):0
                  return(
                    <div key={d.name}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}><div style={{width:'8px',height:'8px',borderRadius:'2px',background:COLORS[i%COLORS.length]}}/><span style={{fontSize:'12px',color:'var(--chronos-text)',fontWeight:500}}>{d.name}</span></div>
                        <div style={{display:'flex',gap:'10px'}}><span style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color:ACCENT}}>{h(d.hours)}</span><span style={{fontSize:'11px',color:'var(--chronos-text-muted)',minWidth:'30px',textAlign:'right'}}>{pct}%</span></div>
                      </div>
                      <div style={{height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                    </div>
                  )
                })}
              </div>
            </>}
          </div>
        </div>

        {/* Projects — each project with its own task breakdown */}
        <div className="card-base" style={{overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--chronos-border)'}}>
            <SecTitle title="Project Breakdown" sub="Hours per project and task type distribution within each project"/>
          </div>
          {byProj.map((p,i)=>(
            <div key={p.id} style={{padding:'16px 20px',borderBottom:i<byProj.length-1?'1px solid var(--chronos-border)':'none'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px 120px',gap:'12px',alignItems:'center',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:COLORS[i%COLORS.length],flexShrink:0}}/>
                  <span style={{fontWeight:700,fontSize:'13px',color:'var(--chronos-text)'}}>{p.name}</span>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'14px',fontWeight:800,color:ACCENT}}>{h(p.hours)}</span>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{flex:1,height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${p.pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                  <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flexShrink:0}}>{p.pct}%</span>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'5px 16px',paddingLeft:'16px'}}>
                {p.taskBreakdown.map((t,j)=>{
                  const tpct=p.hours>0?Math.round((t.hours/p.hours)*100):0
                  return(
                    <div key={t.name} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{width:'6px',height:'6px',borderRadius:'2px',background:COLORS[j%COLORS.length],flexShrink:0}}/>
                      <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'11px',fontWeight:600,color:'var(--chronos-text)',flexShrink:0}}>{h(t.hours)}</span>
                      <span style={{fontSize:'10px',color:'var(--chronos-text-muted)',flexShrink:0,minWidth:'28px',textAlign:'right'}}>{tpct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* People — each with project breakdown */}
        <div className="card-base" style={{overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--chronos-border)'}}>
            <SecTitle title="Contributor Breakdown" sub="Each team member's hours and which projects they worked on for this client"/>
          </div>
          {byPerson.map((p,i)=>(
            <div key={p.id} style={{padding:'16px 20px',borderBottom:i<byPerson.length-1?'1px solid var(--chronos-border)':'none'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 120px 90px 120px',gap:'12px',alignItems:'center',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:'32px',height:'32px',borderRadius:'10px',background:`linear-gradient(135deg,${COLORS[i%COLORS.length]},${COLORS[(i+2)%COLORS.length]})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'white',flexShrink:0}}>{p.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                  <div><div style={{fontWeight:600,fontSize:'13px',color:'var(--chronos-text)'}}>{p.name}</div><div style={{fontSize:'11px',color:'var(--chronos-text-muted)'}}>{p.dept||'—'}</div></div>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'14px',fontWeight:800,color:ACCENT}}>{h(p.hours)}</span>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{flex:1,height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${p.pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                  <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flexShrink:0}}>{p.pct}%</span>
                </div>
                <span style={{fontSize:'11px',color:'var(--chronos-text-muted)'}}>of client total</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:'5px 16px',paddingLeft:'42px'}}>
                {p.projectBreakdown.map((pr,j)=>{
                  const prpct=p.hours>0?Math.round((pr.hours/p.hours)*100):0
                  return(
                    <div key={pr.name} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{width:'6px',height:'6px',borderRadius:'2px',background:COLORS[j%COLORS.length],flexShrink:0}}/>
                      <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pr.name}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'11px',fontWeight:600,color:'var(--chronos-text)',flexShrink:0}}>{h(pr.hours)}</span>
                      <span style={{fontSize:'10px',color:'var(--chronos-text-muted)',flexShrink:0,minWidth:'28px',textAlign:'right'}}>{prpct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }


  // ─── EMPLOYEES ───────────────────────────────────────────────────────────
  const EmployeesTab=()=>{
    const empSummary=Object.entries(gby(logs,l=>l.user_id)).map(([uid,ls])=>({
      id:uid,name:ls[0].userName,department:ls[0].department,hours:sumH(ls),
      projects:Object.keys(ls.reduce((m,l)=>{m[l.project_id]=true;return m},{} as Record<string,true>)).length,
      activeDays:Object.keys(ls.reduce((m,l)=>{m[l.log_date]=true;return m},{} as Record<string,true>)).length,
    })).sort((a,b)=>b.hours-a.hours)
    const empLogs=selEmployee?logs.filter(l=>l.user_id===selEmployee):[]
    const emp=profilesData.find(p=>p.id===selEmployee)
    const totalEH=sumH(empLogs)

    if(!selEmployee){
      const maxH=empSummary[0]?.hours||1
      return(
        <div style={{display:'flex',flexDirection:'column',gap:'16px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'14px'}}>
            <SCard icon={<Users size={20}/>} label="Contributors" value={empSummary.length}/>
            <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalHours)} color="#60a5fa"/>
            <SCard icon={<TrendingUp size={20}/>} label="Avg per Person" value={h(empSummary.length?totalHours/empSummary.length:0)} color="#34d399"/>
          </div>
          {deptData.length>1&&<div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Department"/>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptData} margin={{top:4,right:4,bottom:0,left:-10}}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={(v:number)=>[`${v.toFixed(1)}h`,'Hours']}/>
                <Bar dataKey="hours" radius={[6,6,0,0]}>{deptData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>}
          {empSummary.length===0
            ?<div className="card-base" style={{padding:'60px',textAlign:'center',color:'var(--chronos-text-muted)',fontSize:'14px'}}>No employee data</div>
            :<div className="card-base" style={{overflow:'hidden'}}>
              <div style={{padding:'12px 20px',borderBottom:'1px solid var(--chronos-border)',display:'grid',gridTemplateColumns:'1fr 120px 90px 90px 90px',gap:'10px'}}>
                {['Employee','Department','Hours','Projects','Active Days'].map(hd=><span key={hd} style={{fontSize:'11px',fontWeight:700,color:'var(--chronos-text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{hd}</span>)}
              </div>
              {empSummary.map((e,i)=>(
                <div key={e.id} className="table-row" onClick={()=>setSelEmployee(e.id)}
                  style={{padding:'13px 20px',display:'grid',gridTemplateColumns:'1fr 120px 90px 90px 90px',gap:'10px',alignItems:'center',borderBottom:i<empSummary.length-1?'1px solid var(--chronos-border)':'none',cursor:'pointer'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                    <div style={{width:'32px',height:'32px',borderRadius:'10px',background:`linear-gradient(135deg,${COLORS[i%COLORS.length]},${COLORS[(i+2)%COLORS.length]})`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'white',flexShrink:0}}>{e.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                    <div>
                      <div style={{fontWeight:600,fontSize:'13px',color:'var(--chronos-text)'}}>{e.name}</div>
                      <div style={{width:`${Math.round((e.hours/maxH)*100)}px`,maxWidth:'120px',height:'3px',background:COLORS[i%COLORS.length],borderRadius:'2px',marginTop:'4px',minWidth:'4px'}}/>
                    </div>
                  </div>
                  <span style={{fontSize:'12px',color:'var(--chronos-text-muted)'}}>{e.department||'—'}</span>
                  <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',fontWeight:700,color:ACCENT}}>{h(e.hours)}</span>
                  <span style={{fontSize:'13px',color:'var(--chronos-text-muted)'}}>{e.projects}</span>
                  <span style={{fontSize:'13px',color:'var(--chronos-text-muted)'}}>{e.activeDays}</span>
                </div>
              ))}
            </div>
          }
        </div>
      )
    }

    // ── employee detail ──
    const byProject=Object.entries(gby(empLogs,l=>l.project_id)).map(([pid,ls])=>({id:pid,name:ls[0].projectName,hours:parseFloat(sumH(ls).toFixed(1)),pct:0,taskBreakdown:Object.entries(gby(ls,l=>l.taskTypeName)).map(([tn,tls])=>({name:tn,hours:parseFloat(sumH(tls).toFixed(1))})).sort((a,b)=>b.hours-a.hours)})).sort((a,b)=>b.hours-a.hours).map(p=>({...p,pct:totalEH>0?Math.round((p.hours/totalEH)*100):0}))
    const byTask=Object.entries(gby(empLogs,l=>l.taskTypeName)).map(([n,ls])=>({name:n,hours:parseFloat(sumH(ls).toFixed(1)),pct:0})).sort((a,b)=>b.hours-a.hours).map(t=>({...t,pct:totalEH>0?Math.round((t.hours/totalEH)*100):0}))
    const empWeeks=eachWeekOfInterval({start:pStart,end:pEnd>new Date()?new Date():pEnd},{weekStartsOn:1}).map(w=>{const wE=endOfWeek(w,{weekStartsOn:1}),wS=format(w,'yyyy-MM-dd'),wES=format(wE,'yyyy-MM-dd');return{week:format(w,'MMM d'),hours:parseFloat(sumH(empLogs.filter(l=>l.log_date>=wS&&l.log_date<=wES)).toFixed(1))}})
    const radarData=byTask.slice(0,7).map(t=>({subject:t.name.length>14?t.name.slice(0,14)+'…':t.name,hours:t.hours,fullMark:byTask[0]?.hours||1}))
    const empTS=timesheets.filter(t=>t.user_id===selEmployee)
    const activeDaysE=Object.keys(empLogs.reduce((m,l)=>{m[l.log_date]=true;return m},{} as Record<string,true>)).length

    return(
      <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <button onClick={()=>setSelEmployee(null)} className="btn-secondary" style={{padding:'7px 12px',gap:'6px'}}><ArrowLeft size={13}/> All Employees</button>
          <div>
            <div style={{fontFamily:'var(--font-display)',fontSize:'20px',fontWeight:800}}>{emp?.full_name}</div>
            <div style={{fontSize:'12px',color:'var(--chronos-text-muted)',marginTop:'2px'}}>{emp?.department||'No dept'} · {pl}</div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:'12px'}}>
          <SCard icon={<Clock size={20}/>} label="Total Hours" value={h(totalEH)}/>
          <SCard icon={<FolderKanban size={20}/>} label="Projects" value={byProject.length} color="#60a5fa"/>
          <SCard icon={<Calendar size={20}/>} label="Active Days" value={activeDaysE} color="#34d399"/>
          <SCard icon={<Layers size={20}/>} label="Task Types" value={byTask.length} color="#fbbf24"/>
          <SCard icon={<TrendingUp size={20}/>} label="Avg / Active Day" value={h(activeDaysE?totalEH/activeDaysE:0)} color="#e879f9"/>
        </div>

        {/* Weekly trend */}
        <div className="card-base" style={{padding:'20px'}}>
          <SecTitle title="Weekly Hours" sub="Hours logged per week — useful for capacity planning and appraisals"/>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={empWeeks} margin={{top:4,right:4,bottom:0,left:-10}}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false}/>
              <XAxis dataKey="week" tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:'#64748b'}} axisLine={false} tickLine={false}/>
              <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
              <Bar dataKey="hours" radius={[6,6,0,0]}>{empWeeks.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Task type pie + radar */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px'}}>
          <div className="card-base" style={{padding:'20px'}}>
            <SecTitle title="Hours by Task Type" sub="What type of work this person does"/>
            {byTask.length===0?<div style={{color:'var(--chronos-text-muted)',fontSize:'13px'}}>No task data</div>:<>
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={byTask} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={78} paddingAngle={2} label={({pct})=>`${pct}%`} labelLine={false}>
                    {byTask.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                  </Pie>
                  <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                </PieChart>
              </ResponsiveContainer>
              <div style={{display:'flex',flexDirection:'column',borderTop:'1px solid var(--chronos-border)'}}>
                {byTask.map((t,i)=>(
                  <div key={t.name} style={{display:'grid',gridTemplateColumns:'12px 1fr 52px 44px',gap:'8px',alignItems:'center',padding:'7px 4px',borderBottom:i<byTask.length-1?'1px solid var(--chronos-border)':''}}>
                    <div style={{width:'10px',height:'10px',borderRadius:'3px',background:COLORS[i%COLORS.length]}}/>
                    <span style={{fontSize:'12px',color:'var(--chronos-text)',fontWeight:500}}>{t.name}</span>
                    <span style={{fontFamily:'var(--font-mono)',fontSize:'12px',fontWeight:700,color:ACCENT,textAlign:'right'}}>{h(t.hours)}</span>
                    <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',textAlign:'right'}}>{t.pct}%</span>
                  </div>
                ))}
              </div>
            </>}
          </div>

          {radarData.length>=3
            ?<div className="card-base" style={{padding:'20px'}}>
              <SecTitle title="Skill Radar" sub="Task type distribution — useful for appraisals and role fit"/>
              <ResponsiveContainer width="100%" height={190}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke={GRID}/>
                  <PolarAngleAxis dataKey="subject" tick={{fontSize:10,fill:'#64748b'}}/>
                  <Radar name="Hours" dataKey="hours" stroke={ACCENT} fill={ACCENT} fillOpacity={0.25}/>
                  <Tooltip {...TT} formatter={(v:number)=>[`${v}h`,'Hours']}/>
                </RadarChart>
              </ResponsiveContainer>
            </div>
            :<div className="card-base" style={{padding:'20px'}}>
              <SecTitle title="Projects" sub="Hours per project"/>
              <div style={{display:'flex',flexDirection:'column',gap:'10px',marginTop:'4px'}}>
                {byProject.map((p,i)=><MiniBar key={p.id} label={p.name} value={p.hours} max={byProject[0]?.hours||1} color={COLORS[i%COLORS.length]}/>)}
              </div>
            </div>
          }
        </div>

        {/* Per-project breakdown with task detail */}
        <div className="card-base" style={{overflow:'hidden'}}>
          <div style={{padding:'16px 20px',borderBottom:'1px solid var(--chronos-border)'}}>
            <SecTitle title="Project Breakdown" sub="Hours per project and which task types were worked on within each"/>
          </div>
          {byProject.map((p,i)=>(
            <div key={p.id} style={{padding:'16px 20px',borderBottom:i<byProject.length-1?'1px solid var(--chronos-border)':'none'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 90px 120px',gap:'12px',alignItems:'center',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{width:'8px',height:'8px',borderRadius:'50%',background:COLORS[i%COLORS.length],flexShrink:0}}/>
                  <span style={{fontWeight:700,fontSize:'13px',color:'var(--chronos-text)'}}>{p.name}</span>
                </div>
                <span style={{fontFamily:'var(--font-mono)',fontSize:'14px',fontWeight:800,color:ACCENT}}>{h(p.hours)}</span>
                <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                  <div style={{flex:1,height:'5px',borderRadius:'3px',background:'var(--chronos-surface-2)',overflow:'hidden'}}><div style={{height:'100%',width:`${p.pct}%`,background:COLORS[i%COLORS.length],borderRadius:'3px'}}/></div>
                  <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flexShrink:0}}>{p.pct}%</span>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:'5px 16px',paddingLeft:'16px'}}>
                {p.taskBreakdown.map((t,j)=>{
                  const tpct=p.hours>0?Math.round((t.hours/p.hours)*100):0
                  return(
                    <div key={t.name} style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <div style={{width:'6px',height:'6px',borderRadius:'2px',background:COLORS[j%COLORS.length],flexShrink:0}}/>
                      <span style={{fontSize:'11px',color:'var(--chronos-text-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                      <span style={{fontFamily:'var(--font-mono)',fontSize:'11px',fontWeight:600,color:'var(--chronos-text)',flexShrink:0}}>{h(t.hours)}</span>
                      <span style={{fontSize:'10px',color:'var(--chronos-text-muted)',flexShrink:0,minWidth:'28px',textAlign:'right'}}>{tpct}%</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Timesheets */}
        {empTS.length>0&&<div className="card-base" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 20px',borderBottom:'1px solid var(--chronos-border)',display:'grid',gridTemplateColumns:'1.4fr 1fr 100px 80px',gap:'12px'}}>
            {['Week','Submitted','Status','Hours'].map(hd=><span key={hd} style={{fontSize:'11px',fontWeight:700,color:'var(--chronos-text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{hd}</span>)}
          </div>
          {empTS.map((t,i)=>(
            <div key={t.id} className="table-row" style={{padding:'12px 20px',display:'grid',gridTemplateColumns:'1.4fr 1fr 100px 80px',gap:'12px',alignItems:'center',borderBottom:i<empTS.length-1?'1px solid var(--chronos-border)':'none'}}>
              <span style={{fontSize:'13px',color:'var(--chronos-text)'}}>{format(new Date(t.week_start_date+'T00:00:00'),'MMM d')} – {format(new Date(t.week_end_date+'T00:00:00'),'MMM d, yyyy')}</span>
              <span style={{fontSize:'12px',color:'var(--chronos-text-muted)'}}>{t.submitted_at?format(new Date(t.submitted_at),'MMM d, HH:mm'):'—'}</span>
              <span style={{fontSize:'11px',padding:'3px 9px',borderRadius:'100px',border:`1px solid ${STATUS_COLORS[t.status]}40`,color:STATUS_COLORS[t.status],background:`${STATUS_COLORS[t.status]}15`,width:'fit-content',fontWeight:600,textTransform:'capitalize'}}>{t.status}</span>
              <span style={{fontFamily:'var(--font-mono)',fontSize:'13px',fontWeight:700,color:ACCENT}}>{t.total_hours.toFixed(1)}h</span>
            </div>
          ))}
        </div>}
      </div>
    )
  }


  const exportLabel=()=>{
    if(tab==='projects'&&selProject)return'Export Project'
    if(tab==='clients'&&selClient)return'Export Client'
    if(tab==='employees'&&selEmployee)return'Export Employee'
    return'Export Report'
  }

  return(
    <div style={{display:'flex',flexDirection:'column',gap:'20px'}}>
      <div style={{display:'flex',alignItems:'center',gap:'12px',flexWrap:'wrap'}}>
        <div style={{flex:1}}>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:'22px',fontWeight:800,letterSpacing:'-0.03em'}}>Reports</h1>
          <p style={{color:'var(--chronos-text-muted)',fontSize:'13px',marginTop:'2px'}}>{pl}</p>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
          {(['week','month','quarter','year'] as Period[]).map(p=><button key={p} style={perSt(p)} onClick={()=>setPeriod(p)}>{p[0].toUpperCase()+p.slice(1)}</button>)}
          <button className="btn-secondary" onClick={fetchData} disabled={loading} style={{marginLeft:'4px'}}><RefreshCw size={13} style={{animation:loading?'spin 0.8s linear infinite':'none'}}/></button>
          <button className="btn-primary" onClick={exportReport} disabled={loading}><Download size={13}/>{exportLabel()}</button>
        </div>
      </div>
      <div style={{display:'flex',gap:'4px',background:'var(--chronos-surface-2)',borderRadius:'10px',padding:'4px',width:'fit-content'}}>
        {(['overview','clients','projects',...(canManageProjects?['employees']:[])] as Tab[]).map(t=><button key={t} style={tabSt(t)} onClick={()=>setTab(t)}>{t[0].toUpperCase()+t.slice(1)}</button>)}
      </div>
      {loading?<div style={{display:'flex',justifyContent:'center',padding:'80px'}}><div style={{width:'28px',height:'28px',border:`3px solid var(--chronos-border)`,borderTopColor:ACCENT,borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>:<>
        {tab==='overview'&&<OverviewTab/>}
        {tab==='clients'&&<ClientsTab/>}
        {tab==='projects'&&<ProjectsTab/>}
        {tab==='employees'&&canManageProjects&&<EmployeesTab/>}
      </>}
    </div>
  )
}