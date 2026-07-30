import os, shutil, subprocess, tempfile
REPO="/home/nickolaykondratyev/git_repos/note-ticket"; TK=os.path.join(REPO,"ticket")
cases=["Hello World","Hello   World","  Leading and trailing  ","!!!","","Ünïcödé Tïtle",
       "UPPER_snake_case","a/b\\c","Tabs\there","a - b","v1.2.3 release","İ",
       "a"*250, "a"*199+" tail"]
for title in cases:
    tmp=tempfile.mkdtemp(prefix="s-"); subprocess.run(["git","init","-q",tmp],check=True)
    tickets=os.path.join(tmp,"_tickets"); os.makedirs(tickets)
    env=dict(os.environ,TICKETS_DIR=tickets)
    subprocess.run([TK,"create",title],env=env,cwd=tmp,capture_output=True)
    got=[f for f in os.listdir(tickets)]
    print("%-30r -> %s" % (title[:28], got[0] if got else "NONE"))
    shutil.rmtree(tmp,ignore_errors=True)
