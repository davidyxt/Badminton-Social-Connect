import numpy as np, random, subprocess, json, sys
random.seed(7)
P="00000000-0000-0000-0000-00000000"
players=["a001","a002","a003","a004","a005","a006","a009"]
start={"a001":1500,"a002":1100,"a003":1700,"a004":1900,"a005":1300,"a006":1500,"a009":1100}  # self_rating_band starts
idx={p:i for i,p in enumerate(players)}
def legal_game(win_a):
    t=random.random()
    if t<0.8: w,l=21,random.randint(5,19)
    elif t<0.95:
        w=random.randint(22,29); l=w-2
    else: w,l=30,random.choice([28,29])
    return [w,l] if win_a else [l,w]
def make_match():
    a,b=random.sample(players,2)
    pa=0.5+ (start[a]-start[b])/2500.0
    games=[]; wa=wb=0
    while wa<2 and wb<2:
        awin=random.random()<min(max(pa,0.1),0.9)
        games.append(legal_game(awin)); wa+=awin; wb+=(not awin)
    return a,b,games
matches=[]
day=0.0
for i in range(60):
    day+=random.choice([0,0,0.5,1,3,10,30])
    a,b,g=make_match()
    matches.append((day,a,b,g))
# ---- reference
x,w=np.polynomial.hermite.hermgauss(64)
N=len(players)
m=np.array([start[p] for p in players],float); C=np.eye(N)*350.0**2
prev=None
def softplus(z): return np.logaddexp(0,z)
for day,a,b,g in matches:
    if prev is not None and day>prev:
        dt=day-prev
        C=C+25*dt*np.eye(N)
        S=np.diag(np.minimum(1,350/np.sqrt(np.diag(C))))
        C=S@C@S
    prev=day
    A,B=idx[a],idx[b]
    k=sum(x_[0] for x_ in g); n=sum(x_[0]+x_[1] for x_ in g); G=len(g)
    neff=min(n,6*G,12); alpha=neff/n
    d0=m[A]-m[B]; V=C[A,A]+C[B,B]-2*C[A,B]
    av=(C[:,A]-C[:,B])/V
    D=d0+np.sqrt(2*V)*x
    z=D/800
    l=-alpha*(k*softplus(-z)+(n-k)*softplus(z))
    bj=np.log(w/np.sqrt(np.pi))+l
    om=np.exp(bj-bj.max()); om/=om.sum()
    d1=(om*D).sum(); V1=(om*(D-d1)**2).sum()
    m=m+av*(d1-d0)
    C=C+(V1-V)*np.outer(av,av)
    C=(C+C.T)/2
    C=C+np.diag(np.maximum(0,80.0**2-np.diag(C)))
ref={p:(m[idx[p]],np.sqrt(C[idx[p],idx[p]])) for p in players}
# ---- database
sql=["begin;","update public.match_result set excluded_from_ranking = true where true;"]
for i,(day,a,b,g) in enumerate(matches):
    mid=f"{P}e{i:03d}"; rid=f"{P}d{i:03d}"
    sql.append(f"insert into public.match (match_id, created_by, format, played_at, status) values ('{mid}','{P}a001','singles', timestamptz '2026-01-01 00:00:00+00' + interval '{day} days','in_progress');")
    sql.append(f"insert into public.match_participant (match_id, player_id, side) values ('{mid}','{P}{a}','a'),('{mid}','{P}{b}','b');")
    sql.append(f"update public.match set status='completed' where match_id='{mid}';")
    score=" ".join(f"{x_[0]}-{x_[1]}" for x_ in g)
    wa=sum(1 for x_ in g if x_[0]>x_[1])
    sql.append(f"insert into public.match_result (result_id, match_id, score, games, status, winning_side, submitted_by, confirmed_at) values ('{rid}','{mid}','{score}','{json.dumps(g)}','confirmed','{'a' if wa>1 else 'b'}','{P}{a}', timestamptz '2026-01-01' + interval '{day} days' + interval '{i} seconds');")
sql.append("select private.rebuild_ratings();")
sql.append("select right(player_id::text,4) as pid, mean, sqrt(variance) as rd, trusted_matches, distinct_opponents, is_established from private.rating_state order by 1;")
sql.append("rollback;")
out=subprocess.run(["docker","exec","-i","supabase_db_badminton-social-connect","psql","-U","postgres","-qAt","-F","|","-v","ON_ERROR_STOP=1"],input="\n".join(sql),capture_output=True,text=True)
if out.returncode: print(out.stderr[:2000]); sys.exit(1)
rows=[l.split("|") for l in out.stdout.strip().splitlines() if l.count("|")==5]
maxdm=maxdr=0
for r in rows:
    pid=r[0]; dm=abs(float(r[1])-ref[pid][0]); dr=abs(float(r[2])-ref[pid][1])
    maxdm=max(maxdm,dm); maxdr=max(maxdr,dr)
    print(pid, f"db mean {float(r[1]):10.4f} ref {ref[pid][0]:10.4f} | db rd {float(r[2]):9.4f} ref {ref[pid][1]:9.4f} | matches {r[3]} opps {r[4]} est {r[5]}")
print("max |mean diff|", maxdm, " max |rd diff|", maxdr)
