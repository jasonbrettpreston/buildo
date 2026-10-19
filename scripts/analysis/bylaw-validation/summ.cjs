const d=require(process.argv[2]);const key=process.argv[3]||'detached_house|pitched';const st={};
for(const l of d.lots){const row=l.rows[key];if(!row)continue;for(const [t,r] of Object.entries(row.res)){st[t]=st[t]||{};const rs=String(r.reason);const code=rs.split(':')[0];const s=r.status==="not_evaluated"?"NE:"+(['needs_user_input','condition_unknown','missing_input','map_area_not_held'].includes(code)?rs.split(':').slice(0,2).join(':'):code):r.status;st[t][s]=(st[t][s]||0)+1}}
for(const [t,m] of Object.entries(st))console.log(t.padEnd(26),JSON.stringify(m));
