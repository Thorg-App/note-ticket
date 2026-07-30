#!/usr/bin/env python3
import json, os, shutil, subprocess, tempfile
REPO="/home/nickolaykondratyev/git_repos/note-ticket"
TK=os.path.join(REPO,"ticket"); DUMP=os.path.join(REPO,".tmp/parity/dump.mjs")
tmp=tempfile.mkdtemp(prefix="q-")
subprocess.run(["git","init","-q",tmp],check=True)
tickets=os.path.join(tmp,"_tickets"); os.makedirs(tickets)
env=dict(os.environ,TICKETS_DIR=tickets)
# real tickets via bash create (covers assignee/tags/parent/priority/type)
for args in (["A normal title"],
             ['Title with "quotes"'],
             ["Backslash C:\\path here"],
             ["Tagged","--tags","ui,backend"],
             ["Prio","-p","0","-t","bug","-a","Some One","--external-ref","gh-1"],
             ["Unicode Ünïcödé"]):
    subprocess.run([TK,"create"]+args,env=env,cwd=tmp,capture_output=True)
subprocess.run([TK,"create","Nested"],env=env,cwd=tmp,capture_output=True)
os.makedirs(os.path.join(tickets,"sub"))
shutil.move(os.path.join(tickets,"nested.md"),os.path.join(tickets,"sub","nested.md"))
# hand-written edge cases
open(os.path.join(tickets,"edge.md"),"w").write(
  '---\nid: nid_edge_e\ntitle: "a: b"\nstatus: open\ndeps: [x, y]\nlinks: []\n'
  'created_iso: 2026-01-01T00:00:00Z\n---\n\nbody\n')
open(os.path.join(tickets,"nofm.md"),"w").write("no frontmatter here\n")
b=subprocess.run([TK,"query"],env=env,cwd=tmp,capture_output=True,text=True).stdout
t=subprocess.run(["node",DUMP,"query"],env=env,cwd=tmp,capture_output=True,text=True).stdout
print("RAW EQUAL:", b==t)
if b!=t:
    for lb,lt in zip(b.splitlines(),t.splitlines()):
        if lb!=lt:
            print("BASH:",lb); print("TS  :",lt); print()
    print("nlines bash=%d ts=%d"%(len(b.splitlines()),len(t.splitlines())))
shutil.rmtree(tmp,ignore_errors=True)
