const products = [
  {id:1,title:"雨の日に始まる秘密の物語",maker:"Studio A",genre:"ドラマ",tags:["新作","高評価"],price:1980,rating:4.7,date:"2026-07-12",popular:96,description:"ストーリー重視で探したい人向けのサンプル作品です。",url:"#"},
  {id:2,title:"休日のふたり",maker:"Studio B",genre:"恋愛",tags:["セール"],price:980,rating:4.4,date:"2026-07-10",popular:82,description:"落ち着いた雰囲気の作品を想定したダミーデータです。",url:"#"},
  {id:3,title:"深夜番組スペシャル",maker:"Studio C",genre:"企画",tags:["独占","新作"],price:2480,rating:4.2,date:"2026-07-14",popular:91,description:"企画系作品を探す検索体験の確認用データです。",url:"#"},
  {id:4,title:"夏の記憶",maker:"Studio A",genre:"恋愛",tags:["高評価"],price:1480,rating:4.8,date:"2026-06-28",popular:99,description:"出演者・メーカー・ジャンル検索の確認に使えます。",url:"#"},
  {id:5,title:"密着ドキュメント",maker:"Studio B",genre:"企画",tags:["セール","独占"],price:780,rating:4.1,date:"2026-07-01",popular:74,description:"価格順やタグ絞り込みの動作確認用です。",url:"#"},
  {id:6,title:"静かな夜のドラマ",maker:"Studio C",genre:"ドラマ",tags:["高評価"],price:1880,rating:4.6,date:"2026-06-20",popular:88,description:"実データ接続前の仮作品です。",url:"#"}
];

let activeChip = "";
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

const $ = (id) => document.getElementById(id);
const results = $("results");
const template = $("cardTemplate");

function render(){
  const keyword = $("keyword").value.trim().toLowerCase();
  const genre = $("genreFilter").value;
  const maker = $("makerFilter").value;
  const sort = $("sortFilter").value;

  let filtered = products.filter(p => {
    const haystack = [p.title,p.maker,p.genre,...p.tags].join(" ").toLowerCase();
    return (!keyword || haystack.includes(keyword))
      && (!genre || p.genre === genre)
      && (!maker || p.maker === maker)
      && (!activeChip || p.tags.includes(activeChip));
  });

  filtered.sort((a,b)=>{
    if(sort==="popular") return b.popular-a.popular;
    if(sort==="priceLow") return a.price-b.price;
    return new Date(b.date)-new Date(a.date);
  });

  results.innerHTML = "";
  filtered.forEach(p=>{
    const node = template.content.cloneNode(true);
    node.querySelector(".badge").textContent = p.tags[0] || "作品";
    node.querySelector(".meta").textContent = `${p.maker} / ${p.genre} / ${p.date}`;
    node.querySelector("h3").textContent = p.title;
    node.querySelector(".description").textContent = p.description;
    node.querySelector(".price").textContent = `¥${p.price.toLocaleString()}`;
    node.querySelector(".rating").textContent = `評価 ${p.rating}`;
    const tags = node.querySelector(".tags");
    p.tags.forEach(t=>{const s=document.createElement("span");s.textContent=t;tags.appendChild(s)});
    const fav = node.querySelector(".favorite");
    fav.classList.toggle("active", favorites.includes(p.id));
    fav.textContent = favorites.includes(p.id) ? "♥" : "♡";
    fav.addEventListener("click",()=>toggleFavorite(p.id));
    node.querySelector(".detail-link").href = p.url;
    results.appendChild(node);
  });
  $("resultCount").textContent = filtered.length;
  $("favoriteCount").textContent = favorites.length;
}

function toggleFavorite(id){
  favorites = favorites.includes(id) ? favorites.filter(x=>x!==id) : [...favorites,id];
  localStorage.setItem("favorites",JSON.stringify(favorites));
  render();
}

$("searchBtn").addEventListener("click",render);
$("keyword").addEventListener("input",render);
["genreFilter","makerFilter","sortFilter"].forEach(id=>$(id).addEventListener("change",render));
document.querySelectorAll("[data-chip]").forEach(btn=>btn.addEventListener("click",()=>{
  activeChip = activeChip===btn.dataset.chip ? "" : btn.dataset.chip;
  document.querySelectorAll("[data-chip]").forEach(b=>b.classList.toggle("active",b.dataset.chip===activeChip));
  render();
}));
$("resetBtn").addEventListener("click",()=>{
  $("keyword").value="";$("genreFilter").value="";$("makerFilter").value="";$("sortFilter").value="new";
  activeChip="";document.querySelectorAll("[data-chip]").forEach(b=>b.classList.remove("active"));render();
});
$("favoritesBtn").addEventListener("click",()=>{
  const names = products.filter(p=>favorites.includes(p.id)).map(p=>p.title);
  alert(names.length ? "お気に入り\n\n"+names.join("\n") : "お気に入りはまだありません");
});
$("enterBtn").addEventListener("click",()=>{localStorage.setItem("ageConfirmed","1");$("ageGate").classList.add("hidden")});
$("leaveBtn").addEventListener("click",()=>location.href="https://www.google.com/");
if(localStorage.getItem("ageConfirmed")==="1") $("ageGate").classList.add("hidden");
render();
