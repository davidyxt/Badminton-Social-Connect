import numpy as np, random
random.seed(1); np.random.seed(1)
N=100
x,w=np.polynomial.hermite.hermgauss(64)
true=np.concatenate([np.random.normal(1150,90,40),np.random.normal(1500,90,40),np.random.normal(1850,90,20)]); np.random.shuffle(true)
m=np.full(N,1500.0); C=np.eye(N)*350.0**2
def sp(z): return np.logaddexp(0,z)
def play(a,b):
    pa=1/(1+np.exp(-((true[a]-true[b])+np.random.normal(0,120)-np.random.normal(0,120))/400*1.0))
    games=[];wa=wb=0
    while wa<2 and wb<2:
        sa=sb=0
        while True:
            if random.random()<pa: sa+=1
            else: sb+=1
            if (sa>=21 or sb>=21) and abs(sa-sb)>=2 or max(sa,sb)==30: break
        games.append((sa,sb)); 
        if sa>sb: wa+=1
        else: wb+=1
    return games
def update(a,b,games,m,C):
    k=sum(g[0] for g in games); n=sum(g[0]+g[1] for g in games); G=len(games)
    alpha=min(n,6*G,12)/n
    d0=m[a]-m[b]; V=C[a,a]+C[b,b]-2*C[a,b]; av=(C[:,a]-C[:,b])/V
    D=d0+np.sqrt(2*V)*x; z=D/800
    bj=np.log(w/np.sqrt(np.pi))-alpha*(k*sp(-z)+(n-k)*sp(z))
    om=np.exp(bj-bj.max()); om/=om.sum()
    d1=(om*D).sum(); V1=(om*(D-d1)**2).sum()
    m=m+av*(d1-d0); C=C+(V1-V)*np.outer(av,av); C=(C+C.T)/2
    C=C+np.diag(np.maximum(0,80.0**2-np.diag(C)))
    return m,C
cnt=np.zeros(N,int)
for rnd in range(10):
    perm=np.random.permutation(N)
    for i in range(0,N,2):
        a,b=perm[i],perm[i+1]
        m,C=update(a,b,play(a,b),m,C); cnt[a]+=1;cnt[b]+=1
    C=C+25*np.eye(N); S=np.diag(np.minimum(1,350/np.sqrt(np.diag(C)))); C=S@C@S
    rd=np.sqrt(np.diag(C))
    print(f"after {rnd+1} matches each: RD min {rd.min():.0f} median {np.median(rd):.0f} max {rd.max():.0f}; share with RD<=160: {np.mean(rd<=160):.0%}")
