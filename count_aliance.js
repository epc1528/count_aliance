// ==UserScript==
// @name         TROPAS ALIANZA - v13 AUTO SYNC
// @namespace    https://grepolis.com/tropas-alianza
// @version      13.0
// @description  Auto sube y auto actualiza total - clave + valida alianza
// @author       Emanuel
// @match        https://*.grepolis.com/*
// @connect      tumkrpmhigxclxnxzhlv.supabase.co
// @connect      supabase.co
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

const SUPABASE_URL = "https://tumkrpmhigxclxnxzhlv.supabase.co";
const SUPABASE_KEY = "sb_publishable_zImWVDsRE-MlMXc_T_94tg_0CTMsaQU";

(function(){
    const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    let showMode = GM_getValue("ac_showMode", "total");
    let pos = GM_getValue("ac_pos", {top: 80, left: 300});
    let isMinimized = GM_getValue("ac_minimized", false);
    let allianceClave = GM_getValue("ac_alliance_clave", "");
    let savedAllianceId = GM_getValue("ac_saved_alliance_id", null);
    let savedAllianceName = GM_getValue("ac_saved_alliance_name", "");
    let allRows = [];
    let autoEnabled = GM_getValue("ac_autoEnabled", true);
    let autoMinutes = GM_getValue("ac_autoMinutes", 10);
    let autoInterval = null;

    function getUnitList(){
        let unitArray = ["sword","archer","hoplite","chariot","godsent","rider","slinger","catapult","small_transporter","big_transporter","manticore","harpy","pegasus","cerberus","minotaur","medusa","zyklop","centaur","fury","sea_monster","bireme","trireme","attack_ship","demolition_ship","colonize_ship"];
        try{
            if(uw.Game.hasArtemis) unitArray = unitArray.concat(["griffin","calydonian_boar"]);
            if(uw.Game.gods_active && uw.Game.gods_active.aphrodite) unitArray = unitArray.concat(["siren","satyr"]);
            if(uw.Game.gods_active && uw.Game.gods_active.ares) unitArray = unitArray.concat(["spartoi","ladon"]);
        }catch(e){}
        return [...new Set(unitArray)];
    }
    function getTownTotalUnits(town){
        let total = {};
        try{
            let available = town.units() || {};
            for(let k in available) total[k] = (total[k]||0) + available[k];
            if(typeof town.unitsOuter === 'function'){
                let outer = town.unitsOuter() || {};
                for(let k in outer) total[k] = (total[k]||0) + outer[k];
            }
        }catch(e){}
        return total;
    }
    function getTownAvailableUnits(town){ try{ return town.units() || {}; }catch(e){ return {}; } }
    function getAllTroops(){
        if(!uw.ITowns || !uw.Game) return [];
        let data=[];
        for(let id in uw.ITowns.towns){
            let town=uw.ITowns.towns[id];
            try{
                let available = getTownAvailableUnits(town);
                let total = getTownTotalUnits(town);
                data.push({
                    world_id: uw.Game.world_id,
                    alliance_id: uw.Game.alliance_id,
                    player_id: uw.Game.player_id,
                    player_name: uw.Game.player_name,
                    town_id: parseInt(id),
                    town_name: town.getName(),
                    units: showMode === "total" ? total : available,
                    units_available: available,
                    units_total: total,
                    secret: allianceClave, // GRUPO = CLAVE
                    updated_at: new Date().toISOString()
                });
            }catch(e){}
        }
        return data;
    }

    function checkAllianceChange(){
        if(!uw.Game || !uw.Game.alliance_id) return false;
        let currentId = uw.Game.alliance_id;
        let currentName = "";
        try{
            // Intenta obtener nombre de alianza
            if(uw.MM && uw.MM.getOnlyCollectionByName("Alliance")){
                let al = uw.MM.getOnlyCollectionByName("Alliance").get(currentId);
                if(al) currentName = al.getName ? al.getName() : "";
            }
        }catch(e){}
        if(savedAllianceId && savedAllianceId !== currentId){
            // CAMBIO DE ALIANZA DETECTADO
            return {changed:true, oldId:savedAllianceId, oldName:savedAllianceName, newId:currentId, newName:currentName};
        }
        // Guarda alianza actual si no hay guardada
        if(!savedAllianceId && currentId){
            GM_setValue("ac_saved_alliance_id", currentId);
            GM_setValue("ac_saved_alliance_name", currentName);
            savedAllianceId = currentId;
            savedAllianceName = currentName;
        }
        return false;
    }

    function upload(silent=false, skipLoad=false){
        if(!allianceClave){
            showKeyScreen("Debes ingresar la clave de tu alianza primero");
            return;
        }
        let allianceCheck = checkAllianceChange();
        if(allianceCheck && allianceCheck.changed){
            handleAllianceChange(allianceCheck);
            return;
        }
        let troops=getAllTroops();
        if(!troops.length){
            if(!silent) showToast("No hay ciudades");
            return;
        }
        GM_xmlhttpRequest({
            method:"POST",
            url:`${SUPABASE_URL}/rest/v1/alliance_troops?on_conflict=world_id,town_id`,
            headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates,return=minimal"},
            data:JSON.stringify(troops),
            onload:(r)=>{
                if(r.status>=200&&r.status<300){
                    if(!silent) showToast(`Subidas ${troops.length} ciud.`);
                    // SIEMPRE actualiza el total despues de subir, incluso en silencio
                    if(!skipLoad){
                        setTimeout(()=>{ loadTotal(); }, 1200);
                    }
                } else showToast("Error al subir");
            }
        });
    }

    function startAuto(){
        if(autoInterval) clearInterval(autoInterval);
        if(!autoEnabled || !allianceClave) return;
        autoInterval = setInterval(()=>{
            // Auto: sube + actualiza total
            upload(true, false);
            // Y 5 seg despues vuelve a actualizar por si otros subieron
            setTimeout(()=>{ loadTotal(); }, 5000);
            console.log(`[TROPAS] Auto-sync: subido + total actualizado (${autoMinutes}min)`);
        }, autoMinutes*60*1000);
    }
    function stopAuto(){
        if(autoInterval){ clearInterval(autoInterval); autoInterval=null; }
    }
    function loadTotal(){
        if(!allianceClave) return;
        let allianceCheck = checkAllianceChange();
        if(allianceCheck && allianceCheck.changed){
            handleAllianceChange(allianceCheck);
            return;
        }
        // FILTRO POR MUNDO + ALIANZA + CLAVE (GRUPO)
        let url = `${SUPABASE_URL}/rest/v1/alliance_troops?world_id=eq.${uw.Game.world_id}&secret=eq.${encodeURIComponent(allianceClave)}&select=*`;
        GM_xmlhttpRequest({
            method:"GET",
            url:url,
            headers:{"apikey":SUPABASE_KEY,"Authorization":`Bearer ${SUPABASE_KEY}`},
            onload:(r)=>{
                try{
                    let rows=JSON.parse(r.responseText);
                    if(!Array.isArray(rows)) return;
                    allRows=rows;
                    render();
                }catch(e){}
            }
        });
    }
    function sumUnits(rows, field){
        let t={};
        rows.forEach(r=>{
            let u = field ? (r[field]||r.units||{}) : (r.units||{});
            for(let k in u) t[k]=(t[k]||0)+(u[k]||0);
        });
        return t;
    }
    function renderUnitsDIO(unitsObj, sizeClass, showZero){
        let unitList = getUnitList();
        let isSmall = sizeClass.includes("25");
        let html="";
        for(let unitId of unitList){
            let count = unitsObj[unitId]||0;
            if(!showZero && count===0) continue;
            let has = count>0;
            let countFormatted = count.toLocaleString();
            let iconSize = isSmall ? 26 : 40;
            html+=`<div style="display:inline-flex;flex-direction:column;align-items:center;margin:3px;${!has && showZero ? 'opacity:0.4;filter:grayscale(100%);' : ''}">
                <div class="${sizeClass} ${unitId}" style="width:${iconSize}px;height:${iconSize}px;display:block;border:1px solid ${has?'#8b6a32':'#aaa'};border-bottom:none;border-radius:5px 5px 0 0"></div>
                <div style="width:${iconSize+2}px;text-align:center;font-size:${isSmall?'9px':'10px'};font-weight:bold;color:${has?'#fff':'#999'};background:${has?'#2a4a6d':'#444'};border:1px solid ${has?'#6e4b0b':'#777'};border-top:1px solid ${has?'#ffd700':'#666'};border-radius:0 0 5px 5px;padding:2px 0;line-height:12px">${countFormatted}</div>
            </div>`;
        }
        return html;
    }
    function render(){ renderInicio(); renderLista(); let ic=document.getElementById("ta-icon-count"); if(ic) ic.innerText=allRows.length||''; updateHeaderInfo(); }

    function updateHeaderInfo(){
        let info=document.getElementById("ta-header-info");
        if(!info) return;
        if(allianceClave && savedAllianceId){
            info.innerHTML=`🔑 ${allianceClave.substring(0,4)}*** • Ali ${savedAllianceId}`;
            info.title=`Clave: ${allianceClave} | Alianza: ${savedAllianceId}`;
        } else {
            info.innerHTML=`Sin clave`;
        }
    }

    function handleAllianceChange(change){
        // Limpia clave y datos si cambia de alianza
        let modal=document.getElementById("ta-alliance-change-modal");
        if(modal){
            document.getElementById("ta-ac-old").innerText=change.oldName ? `${change.oldName} (${change.oldId})` : `ID ${change.oldId}`;
            document.getElementById("ta-ac-new").innerText=change.newName ? `${change.newName} (${change.newId})` : `ID ${change.newId}`;
            modal.style.display="flex";
        }
    }

    function showToast(msg){
        let toast=document.getElementById("ta-toast");
        if(!toast){
            toast=document.createElement("div");
            toast.id="ta-toast";
            toast.style.cssText="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:#1a2f4a;color:#ffeec2;padding:8px 16px;border-radius:20px;font-size:11px;font-weight:bold;border:1px solid #8b6a32;z-index:200;box-shadow:0 2px 8px rgba(0,0,0,0.4);transition:opacity 0.3s;pointer-events:none";
            document.getElementById("ta-panel-inner").appendChild(toast);
        }
        toast.innerText=msg;
        toast.style.opacity="1";
        setTimeout(()=>{ toast.style.opacity="0"; }, 2800);
    }

    function showKeyScreen(msg){
        switchTab('inicio');
        renderInicio(msg);
    }

    function renderInicio(customMsg){
        // VALIDA CAMBIO DE ALIANZA PRIMERO
        let allianceCheck = checkAllianceChange();
        if(allianceCheck && allianceCheck.changed){
            handleAllianceChange(allianceCheck);
            return;
        }

        if(!allianceClave){
            document.getElementById("ta-tab-inicio").innerHTML=`
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px 16px;min-height:300px">
                    <div style="background:white;border:2px solid #8b6a32;border-radius:16px;padding:24px;width:100%;max-width:320px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.15)">
                        <div style="width:56px;height:56px;background:#1a2f4a;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:28px">🔒</div>
                        <div style="font-weight:bold;color:#1a2f4a;font-size:16px">Acceso Restringido</div>
                        <div style="font-size:12px;color:#8b6a32;margin-top:6px;line-height:1.4">${customMsg ? customMsg : 'Ingresa la clave de tu alianza para habilitar el bot.<br>La clave funciona como grupo.'}</div>
                        
                        <div style="margin-top:18px;text-align:left">
                            <div style="font-size:10px;color:#6e4b0b;font-weight:bold;margin-bottom:6px;letter-spacing:0.5px">CLAVE DE ALIANZA / GRUPO</div>
                            <input id="ta-clave-input-inline" type="text" placeholder="Ej: EPC-2026-GRUPO1" style="width:100%;padding:12px 14px;border:2px solid #c8a45a;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box;transition:all 0.2s" autocomplete="off" spellcheck="false">
                            <div id="ta-clave-error-inline" style="font-size:11px;color:#c0392b;margin-top:8px;display:none;background:#fdeaea;padding:6px 8px;border-radius:6px;border:1px solid #f5c6cb"></div>
                        </div>

                        <div id="ta-clave-btn-inline" style="margin-top:16px;background:linear-gradient(to bottom,#6e9e4a,#4a6b32);color:white;padding:13px;border-radius:10px;cursor:pointer;font-weight:bold;font-size:13px;box-shadow:0 3px 8px rgba(74,107,50,0.3);letter-spacing:0.5px">🔓 DESBLOQUEAR</div>
                        
                        <div style="margin-top:14px;padding:10px;background:#fff9e1;border-radius:8px;border:1px dashed #e1af55">
                            <div style="font-size:10px;color:#6e4b0b;text-align:left;line-height:1.4">
                                <b>💡 Cómo funciona:</b><br>
                                • Misma clave = mismo grupo, ven las mismas tropas<br>
                                • Cambia la clave para cambiar de grupo<br>
                                • Solo miembros de tu alianza con esta clave pueden ver los datos
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.getElementById("ta-clave-btn-inline").onclick=handleClaveInline;
            let inp=document.getElementById("ta-clave-input-inline");
            inp.onkeydown=(e)=>{ if(e.key==='Enter') handleClaveInline(); };
            inp.onfocus=function(){ this.style.borderColor="#6e9e4a"; };
            inp.onblur=function(){ this.style.borderColor="#c8a45a"; };
            setTimeout(()=>{ inp.focus(); }, 100);
            return;
        }

        if(!allRows.length){
            document.getElementById("ta-tab-inicio").innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;min-height:250px">
                <div style="font-size:36px">📭</div><div style="font-weight:bold;color:#6e4b0b;margin-top:10px">Sin datos en este grupo</div><div style="font-size:11px;color:#8b6a32;margin-top:4px">Grupo: <b>${allianceClave}</b></div><div style="font-size:11px;margin-top:12px">Presiona SUBIR para ser el primero</div>
                <div style="display:flex;gap:8px;margin-top:18px"><div id="ta-change-clave-empty" style="font-size:11px;background:#1a2f4a;color:#ffeec2;padding:8px 14px;border-radius:8px;cursor:pointer">🔑 Cambiar grupo</div></div>
            </div>`;
            document.getElementById("ta-change-clave-empty").onclick=clearClave;
            return;
        }
        let totalsCurrent = sumUnits(allRows, "units");
        let totalsAvailable = sumUnits(allRows, "units_available");
        let totalsReal = sumUnits(allRows, "units_total");

        let html=`
            <div style="padding:0">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding:0 2px">
                    <div style="font-size:10px;color:#6e4b0b;background:white;padding:4px 10px;border-radius:20px;border:1px solid #e1af55">👥 Grupo: <b>${allianceClave}</b> • ${allRows.length} ciud.</div>
                    <div id="ta-change-clave-top" style="font-size:10px;color:#2a4a6d;cursor:pointer;text-decoration:underline;background:#e8f0fe;padding:4px 10px;border-radius:20px">Cambiar grupo</div>
                </div>
                <div style="display:flex;gap:6px;margin-bottom:12px">
                    <div id="ta-mode-available" style="flex:1;padding:10px;text-align:center;cursor:pointer;border-radius:8px;font-size:12px;font-weight:bold;border:2px solid ${showMode==='available'?'#4a6b32':'#d0b070'};background:${showMode==='available'?'#6e9e4a':'white'};color:${showMode==='available'?'white':'#6e4b0b'}">
                        EN CIUDAD<br><span style="font-size:14px">${Object.values(totalsAvailable).reduce((a,b)=>a+b,0).toLocaleString()}</span>
                    </div>
                    <div id="ta-mode-total" style="flex:1;padding:10px;text-align:center;cursor:pointer;border-radius:8px;font-size:12px;font-weight:bold;border:2px solid ${showMode==='total'?'#4a6b32':'#d0b070'};background:${showMode==='total'?'#6e9e4a':'white'};color:${showMode==='total'?'white':'#6e4b0b'}">
                        TOTAL<br><span style="font-size:14px">${Object.values(totalsReal).reduce((a,b)=>a+b,0).toLocaleString()}</span>
                    </div>
                </div>
                <div style="background:white;border-radius:10px;padding:12px;border:1px solid #e1af55">
                    <div style="line-height:0">${renderUnitsDIO(totalsCurrent, "unit_icon40x40", true)}</div>
                </div>
            </div>
        `;
        document.getElementById("ta-tab-inicio").innerHTML=html;
        document.getElementById("ta-mode-available").onclick=()=>{ showMode="available"; GM_setValue("ac_showMode","available"); upload(); };
        document.getElementById("ta-mode-total").onclick=()=>{ showMode="total"; GM_setValue("ac_showMode","total"); upload(); };
        document.getElementById("ta-change-clave-top").onclick=clearClave;
    }

    function clearClave(){
        if(confirm(`¿Cambiar de grupo?\n\nGrupo actual: ${allianceClave}\n\nSi cambias la clave verás otro grupo de tropas.`)){
            allianceClave="";
            GM_setValue("ac_alliance_clave","");
            allRows=[];
            render();
        }
    }

    function handleClaveInline(){
        let input=document.getElementById("ta-clave-input-inline");
        let error=document.getElementById("ta-clave-error-inline");
        let val=(input.value||"").trim();
        if(val.length<3){
            error.innerText="❌ Clave muy corta (mínimo 3 caracteres)";
            error.style.display="block";
            input.style.borderColor="#c0392b";
            return;
        }
        // Guarda clave + alianza actual
        allianceClave=val;
        GM_setValue("ac_alliance_clave", val);
        if(uw.Game && uw.Game.alliance_id){
            GM_setValue("ac_saved_alliance_id", uw.Game.alliance_id);
            savedAllianceId = uw.Game.alliance_id;
            try{
                let alName="";
                if(uw.MM && uw.MM.getOnlyCollectionByName("Alliance")){
                    let al = uw.MM.getOnlyCollectionByName("Alliance").get(uw.Game.alliance_id);
                    if(al && al.getName) alName=al.getName();
                }
                GM_setValue("ac_saved_alliance_name", alName);
                savedAllianceName=alName;
            }catch(e){}
        }
        loadTotal();
        upload(true);
        showToast(`Grupo: ${val}`);
    }

    function renderLista(){
        if(!allianceClave){
            document.getElementById("ta-tab-lista").innerHTML=`<div style="padding:30px;text-align:center;color:#8b6a32"><div style="font-size:30px">🔒</div><div style="margin-top:8px;font-size:12px">Ingresa la clave en INICIO</div></div>`;
            return;
        }
        if(!allRows.length){
            document.getElementById("ta-tab-lista").innerHTML=`<div style="padding:30px;text-align:center;color:#8b6a32">Sin datos en grupo <b>${allianceClave}</b></div>`;
            return;
        }
        let players={};
        allRows.forEach(r=>{ if(!players[r.player_name]) players[r.player_name]=[]; players[r.player_name].push(r); });
        let html=`<div style="margin-bottom:10px;font-size:10px;color:#6e4b0b;background:white;padding:6px 10px;border-radius:20px;border:1px solid #e1af55;display:inline-block">Grupo: <b>${allianceClave}</b> • ${Object.keys(players).length} jug.</div>`;
        for(let pname in players){
            let prows=players[pname];
            let pt=sumUnits(prows,"units");
            let totalTropas = Object.values(pt).reduce((a,b)=>a+b,0);
            let ptAvail=sumUnits(prows,"units_available");
            let ptTotal=sumUnits(prows,"units_total");
            let totalAvail = Object.values(ptAvail).reduce((a,b)=>a+b,0);
            let totalReal = Object.values(ptTotal).reduce((a,b)=>a+b,0);
            let accId="acc_"+pname.replace(/[^a-z0-9]/gi,'')+"_"+Math.random().toString(36).substr(2,4);
            let modeId="mode_"+accId;

            html+=`
            <div style="border:1px solid #d0b070;margin-bottom:8px;background:white;border-radius:10px;overflow:hidden">
                <div onclick="let el=document.getElementById('${accId}');el.style.display=el.style.display==='none'?'block':'none'" style="padding:12px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;background:#fff9e1">
                    <div>
                        <div style="font-weight:bold;color:#6e4b0b;font-size:13px">${pname} <span style="font-size:10px;background:#6e4b0b;color:white;padding:2px 6px;border-radius:10px">${prows.length}</span></div>
                        <div style="margin-top:6px;line-height:0">${renderUnitsDIO(pt, "unit_icon25x25", false)}</div>
                    </div>
                    <div style="font-weight:bold;color:#6e4b0b;font-size:15px;margin-left:12px">${(totalTropas/1000).toFixed(1)}k</div>
                </div>
                <div id="${accId}" style="display:none;background:#fffef5;padding:12px;border-top:1px solid #e1af55">
                    <div style="display:flex;gap:6px;margin-bottom:10px">
                        <div id="${modeId}_avail" onclick="document.getElementById('${modeId}_content_avail').style.display='block';document.getElementById('${modeId}_content_total').style.display='none';this.style.background='#6e9e4a';this.style.color='white';document.getElementById('${modeId}_total').style.background='white';document.getElementById('${modeId}_total').style.color='#6e4b0b'" style="flex:1;padding:8px;text-align:center;cursor:pointer;border:2px solid #d0b070;background:white;color:#6e4b0b;border-radius:8px;font-size:11px;font-weight:bold">EN CIUDAD<br>${totalAvail.toLocaleString()}</div>
                        <div id="${modeId}_total" onclick="document.getElementById('${modeId}_content_total').style.display='block';document.getElementById('${modeId}_content_avail').style.display='none';this.style.background='#6e9e4a';this.style.color='white';document.getElementById('${modeId}_avail').style.background='white';document.getElementById('${modeId}_avail').style.color='#6e4b0b'" style="flex:1;padding:8px;text-align:center;cursor:pointer;border:2px solid #4a6b32;background:#6e9e4a;color:white;border-radius:8px;font-size:11px;font-weight:bold">TOTAL<br>${totalReal.toLocaleString()}</div>
                    </div>
                    <div id="${modeId}_content_avail" style="display:none"><div style="line-height:0">${renderUnitsDIO(ptAvail, "unit_icon40x40", true)}</div></div>
                    <div id="${modeId}_content_total" style="display:block"><div style="line-height:0">${renderUnitsDIO(ptTotal, "unit_icon40x40", true)}</div></div>
                </div>
            </div>`;
        }
        document.getElementById("ta-tab-lista").innerHTML=html;
    }

    function switchTab(tab){
        document.querySelectorAll(".ta-tab-content").forEach(el=>el.style.display="none");
        document.getElementById("ta-tab-"+tab).style.display="block";
        document.querySelectorAll(".ta-tab-btn").forEach(el=>{ el.style.background="#fff9e1"; el.style.color="#6e4b0b"; });
        let activeBtn=document.getElementById("ta-btn-"+tab);
        if(activeBtn){ activeBtn.style.background="#6e9e4a"; activeBtn.style.color="white"; }
    }
    function makeDraggable(){
        let panel = document.getElementById("ta-panel");
        let header = document.getElementById("ta-header");
        let icon = document.getElementById("ta-icon");
        let isDraggingPanel=false, startX, startY, startLeft, startTop;
        header.style.cursor="move";
        header.addEventListener("mousedown", (e)=>{
            if(e.target.closest("#ta-min")) return;
            isDraggingPanel=true; startX=e.clientX; startY=e.clientY;
            let rect=panel.getBoundingClientRect(); startLeft=rect.left; startTop=rect.top;
            document.body.style.userSelect="none";
        });
        document.addEventListener("mousemove", (e)=>{
            if(!isDraggingPanel) return;
            let dx=e.clientX-startX, dy=e.clientY-startY;
            let newLeft=startLeft+dx, newTop=startTop+dy;
            newLeft=Math.max(5, Math.min(window.innerWidth-panel.offsetWidth-5, newLeft));
            newTop=Math.max(5, Math.min(window.innerHeight-80, newTop));
            panel.style.left=newLeft+"px"; panel.style.top=newTop+"px"; panel.style.right="auto"; panel.style.bottom="auto";
        });
        document.addEventListener("mouseup", ()=>{
            if(isDraggingPanel){ isDraggingPanel=false; document.body.style.userSelect=""; let rect=panel.getBoundingClientRect(); GM_setValue("ac_pos", {top: rect.top, left: rect.left}); }
        });
        let isDraggingIcon=false, iconStartX, iconStartY, iconStartLeft, iconStartTop, iconMoved=false;
        icon.style.cursor="grab";
        icon.addEventListener("mousedown", (e)=>{
            isDraggingIcon=true; iconMoved=false;
            iconStartX=e.clientX; iconStartY=e.clientY;
            let rect=icon.getBoundingClientRect(); iconStartLeft=rect.left; iconStartTop=rect.top;
            icon.style.cursor="grabbing"; document.body.style.userSelect="none"; e.preventDefault();
        });
        document.addEventListener("mousemove", (e)=>{
            if(!isDraggingIcon) return;
            let dx=e.clientX-iconStartX, dy=e.clientY-iconStartY;
            if(Math.abs(dx)>3 || Math.abs(dy)>3) iconMoved=true;
            let newLeft=iconStartLeft+dx, newTop=iconStartTop+dy;
            newLeft=Math.max(5, Math.min(window.innerWidth-60, newLeft));
            newTop=Math.max(5, Math.min(window.innerHeight-60, newTop));
            icon.style.left=newLeft+"px"; icon.style.top=newTop+"px"; icon.style.right="auto"; icon.style.bottom="auto";
        });
        document.addEventListener("mouseup", ()=>{
            if(isDraggingIcon){ isDraggingIcon=false; icon.style.cursor="grab"; document.body.style.userSelect=""; let rect=icon.getBoundingClientRect(); GM_setValue("ac_icon_pos", {top: rect.top, left: rect.left}); }
        });
        icon._wasDragged = ()=>iconMoved;
    }
    function minimizeToIcon(){
        let icon = document.getElementById("ta-icon");
        let panel = document.getElementById("ta-panel");
        let panelRect = panel.getBoundingClientRect();
        let iconPos = GM_getValue("ac_icon_pos", null);
        if(iconPos){ icon.style.left=iconPos.left+"px"; icon.style.top=iconPos.top+"px"; }
        else { icon.style.left=(panelRect.left+panelRect.width/2-28)+"px"; icon.style.top=(panelRect.top+20)+"px"; }
        icon.style.right="auto"; icon.style.bottom="auto";
        panel.style.display="none"; icon.style.display="flex"; GM_setValue("ac_minimized", true);
    }
    function restoreFromIcon(){
        let icon = document.getElementById("ta-icon");
        if(icon._wasDragged && icon._wasDragged()){ icon._wasDragged=()=>false; return; }
        document.getElementById("ta-panel").style.display="flex"; icon.style.display="none"; GM_setValue("ac_minimized", false);
    }

    function injectUI(){
        if(document.getElementById("ta-ui")) return;
        let div=document.createElement("div");
        div.id="ta-ui";
        let iconPos = GM_getValue("ac_icon_pos", {top: pos.top+100, left: pos.left});
        div.innerHTML=`
        <style>
            #ta-ui .unit_icon40x40{width:40px;height:40px;display:inline-block}
            #ta-ui .unit_icon25x25{width:25px;height:25px;display:inline-block}
            #ta-ui ::-webkit-scrollbar{width:6px}
            #ta-ui ::-webkit-scrollbar-thumb{background:#c8a45a;border-radius:3px}
            #ta-ui #ta-icon:active{transform:scale(0.95)}
            #ta-ui input:focus{border-color:#6e9e4a !important;box-shadow:0 0 0 3px rgba(110,158,74,0.2) !important}
        </style>
        <div id="ta-icon" style="display:${isMinimized?'flex':'none'};position:fixed;top:${iconPos.top}px;left:${iconPos.left}px;z-index:9999999;width:52px;height:52px;background:#2a4a6d;border:2px solid #8b6a32;border-radius:50%;align-items:center;justify-content:center;cursor:grab;box-shadow:0 3px 10px rgba(0,0,0,0.4);font-size:22px;user-select:none">🏰<div style="position:absolute;top:-3px;right:-3px;background:#4a6b32;color:white;font-size:8px;padding:2px 5px;border-radius:10px;font-weight:bold" id="ta-icon-count"></div></div>

        <div id="ta-panel" style="display:${isMinimized?'none':'flex'};position:fixed;top:${pos.top}px;left:${pos.left}px;z-index:9999998;width:640px;max-height:88vh;flex-direction:column;box-shadow:0 6px 24px rgba(0,0,0,0.4);border-radius:12px;overflow:hidden">
            <div id="ta-panel-inner" style="background:#1a2f4a;border-radius:12px;display:flex;flex-direction:column;max-height:88vh;overflow:hidden;border:2px solid #8b6a32;position:relative">
                <div id="ta-header" style="background:#1a2f4a;color:#ffeec2;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;user-select:none">
                    <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">🏰</span><span style="font-weight:bold;font-size:13px">TROPAS</span><span id="ta-header-info" style="font-size:9px;opacity:0.7;background:#0a1a2a;padding:3px 8px;border-radius:10px;margin-left:4px"></span></div>
                    <div style="display:flex;gap:6px;align-items:center"><div id="ta-min" style="cursor:pointer;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#0a1a2a;color:#ffeec2;font-size:14px">—</div></div>
                </div>
                <div style="display:flex;background:#0a1a2a;padding:6px;gap:6px">
                    <div id="ta-btn-inicio" class="ta-tab-btn" style="flex:1;padding:9px;text-align:center;cursor:pointer;font-weight:bold;font-size:12px;background:#6e9e4a;color:white;border-radius:8px">INICIO</div>
                    <div id="ta-btn-lista" class="ta-tab-btn" style="flex:1;padding:9px;text-align:center;cursor:pointer;font-weight:bold;font-size:12px;background:#fff9e1;color:#6e4b0b;border-radius:8px">LISTA</div>
                    <div id="ta-upload" style="background:#2a7a2a;color:white;padding:9px 16px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:12px">SUBIR</div>
                </div>
                <div id="ta-body" style="background:#fef9e7;overflow:auto;flex:1;max-height:65vh;position:relative">
                    <div id="ta-tab-inicio" class="ta-tab-content" style="display:block;padding:12px"></div>
                    <div id="ta-tab-lista" class="ta-tab-content" style="display:none;padding:12px"></div>
                </div>

                <!-- MODAL CAMBIO DE ALIANZA -->
                <div id="ta-alliance-change-modal" style="display:none;position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(20,10,0,0.92);z-index:300;align-items:center;justify-content:center;padding:20px">
                    <div style="background:#fff9e1;border:2px solid #c0392b;border-radius:14px;padding:22px;width:100%;max-width:340px;text-align:center;box-shadow:0 8px 24px rgba(0,0,0,0.6)">
                        <div style="font-size:36px">⚠️</div>
                        <div style="font-weight:bold;color:#c0392b;font-size:15px;margin-top:10px">Cambiaste de Alianza</div>
                        <div style="font-size:12px;color:#6e4b0b;margin-top:8px;line-height:1.4">Ya no estás en la alianza anterior.<br>Tus tropas antiguas no se mostrarán.</div>
                        <div style="margin-top:14px;background:white;border:1px solid #e1af55;border-radius:8px;padding:10px;text-align:left;font-size:11px">
                            <div>Antes: <b id="ta-ac-old">-</b></div>
                            <div style="margin-top:4px">Ahora: <b id="ta-ac-new">-</b></div>
                        </div>
                        <div id="ta-ac-confirm" style="margin-top:16px;background:#c0392b;color:white;padding:12px;border-radius:10px;cursor:pointer;font-weight:bold">ENTENDIDO, CAMBIAR CLAVE</div>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.appendChild(div);
        document.getElementById("ta-btn-inicio").onclick=()=>switchTab('inicio');
        document.getElementById("ta-btn-lista").onclick=()=>switchTab('lista');
        document.getElementById("ta-upload").onclick=()=>upload(false);
        document.getElementById("ta-min").onclick=minimizeToIcon;
        document.getElementById("ta-icon").onclick=restoreFromIcon;
        document.getElementById("ta-ac-confirm").onclick=()=>{
            // Limpia todo al cambiar de alianza
            allianceClave="";
            GM_setValue("ac_alliance_clave","");
            GM_setValue("ac_saved_alliance_id", uw.Game.alliance_id);
            GM_setValue("ac_saved_alliance_name", "");
            savedAllianceId = uw.Game.alliance_id;
            allRows=[];
            document.getElementById("ta-alliance-change-modal").style.display="none";
            render();
            showToast("Cambio de alianza detectado - ingresa nueva clave");
        };

        makeDraggable();
        setTimeout(()=>{
            loadTotal();
            if(allianceClave){
                upload(true);
                startAuto();
                // Ademas, actualiza el total cada 5 min aunque no subas (para ver lo que suben otros)
                setInterval(()=>{ if(allianceClave) loadTotal(); }, 5*60*1000);
            } else render();
        }, 800);
    }
    let check=setInterval(()=>{ if(uw.Game&&uw.ITowns&&uw.ITowns.towns){clearInterval(check);injectUI();}},1500);
})();
