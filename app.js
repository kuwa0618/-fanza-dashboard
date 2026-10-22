// Keep navigation synchronous; recording must never block opening FANZA.
function trackFanzaClick(product, source = "ranking", linkType = "button") {
  if (window.FanzaAnalytics?.isInternal) return;
  const contentId = product.id || product.content_id;
  if (!contentId || !product.url || product.url === "#") return;

  const payload = {
    content_id: contentId,
    link_source: source,
    link_type: linkType,
    title: product.title || "",
    actress: product.actresses?.join(", ") || product.actress || "",
    maker: product.maker || "",
    genre: product.genres?.join(", ") || product.genre || "",
  };

  try {
    fetch("/api/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }).catch((error) => console.error("クリック記録に失敗しました:", error));
  } catch (error) {
    console.error("クリック記録に失敗しました:", error);
  }

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "fanza_click", {
        ...payload,
        link_url: product.url,
        link_source: source,
        transport_type: "beacon",
      });
    }
  } catch (error) {
    console.error("GAクリック記録に失敗しました:", error);
  }
}

// Internal detail navigation never records a FANZA outbound click.
function setProductTitle(node, product) {
  const title = node.querySelector("h3");
  title.textContent = product.title;
  if (/^[a-zA-Z0-9_]{3,80}$/.test(product.id || "")) {
    const link = document.createElement("a");
    link.href = `/product/${encodeURIComponent(product.id)}`;
    link.textContent = product.title;
    title.replaceChildren(link);
  }
}

function bindFanzaProductLink(link, product, source, linkType = "button") {
  link.href = product.url;
  link.target = "_blank";
  link.rel = "nofollow noopener noreferrer sponsored";

  const onActivate = (event) => {
    if (event.type === "auxclick" && event.button !== 1) return;
    trackFanzaClick(product, source, linkType);
    try {
      const history = JSON.parse(localStorage.getItem("viewHistory") || "[]");
      localStorage.setItem("viewHistory", JSON.stringify([
        product,
        ...history.filter((item) => item.id !== product.id),
      ].slice(0, 50)));
      saveRelatedSource(product);
    } catch (error) {
      console.error("作品の閲覧履歴保存に失敗しました:", error);
    }
  };

  link.addEventListener("click", onActivate);
  link.addEventListener("auxclick", onActivate);
}

let products = [];
let recommendationProducts = [];
let recommendationVisibleCount = 6;
let saleProducts = [];
let saleVisibleCount = 6;

let relatedSourceProduct =
  JSON.parse(localStorage.getItem("relatedSourceProduct") || "null");
let activeChip = "";
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
let favoriteProducts = JSON.parse(
  localStorage.getItem("favoriteProducts") || "{}"
);
let showHistoryOnly = false;
let nextOffset = 1;
let currentKeyword = "";
let isLoadingMore = false;
let searchRequestId = 0;
let navigationSearch = window.location.search;

function pushSearchHistory(state, title, url) {
  history.pushState(state, title, url);
  navigationSearch = window.location.search;
}

const $ = (id) => document.getElementById(id);
const results = $("results");
const template = $("cardTemplate");
const autocompleteList = $("autocompleteList");
let autocompleteIndex = -1;
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function getItemInfoNames(product, key) {
  return asArray(product?.iteminfo?.[key])
    .map((item) => item?.name)
    .filter(Boolean);
}

// Accept one monetary amount (including the API's trailing range marker).
// Never turn ranges such as "500～1000" into the fictional price 5001000.
function toNumber(value) {
  const text = String(value ?? "").trim().replace(/,/g, "");
  return /^\d+(?:[~〜～])?$/.test(text) ? Number(text.replace(/[~〜～]/g, "")) : 0;
}

function getDeliveries(product) {
  return asArray(product?.prices?.deliveries?.delivery);
}

function getPricePair(product) {
  const pairs = getDeliveries(product).map((delivery) => ({
    price: toNumber(delivery?.price),
    listPrice: toNumber(delivery?.list_price),
  })).filter((pair) => pair.price > 0);
  // Compare within one delivery format; unrelated formats are not discounts.
  const discounted = pairs.filter((pair) => pair.listPrice > pair.price);
  if (discounted.length) return discounted.sort((a, b) => a.price - b.price)[0];
  if (pairs.length) return pairs.sort((a, b) => a.price - b.price)[0];
  return { price: toNumber(product?.prices?.price), listPrice: toNumber(product?.prices?.list_price) };
}

function getPrice(product) { return getPricePair(product).price; }
function getListPrice(product) { return getPricePair(product).listPrice; }

function getReview(product) {
  const average = Number(product?.review?.average);
  const count = Number(product?.review?.count);
  return Number.isFinite(average) && average >= 1 && average <= 5 &&
    Number.isSafeInteger(count) && count > 0 ? { average, count } : null;
}

function addImageCandidate(list, value) {
  if (
    typeof value === "string" &&
    value.startsWith("http") &&
    !list.includes(value)
  ) {
    list.push(value);
  }
}

function getImageCandidates(product) {
  const images = [];

  addImageCandidate(images, product?.imageURL?.large);
  addImageCandidate(images, product?.imageURL?.list);
  addImageCandidate(images, product?.imageURL?.small);

  asArray(
    product?.sampleImageURL?.sample_l?.image
  ).forEach((url) => {
    addImageCandidate(images, url);
  });

  asArray(
    product?.sampleImageURL?.sample_s?.image
  ).forEach((url) => {
    addImageCandidate(images, url);
  });

  const isPlaceholder = (url) => {
    const lower = String(url).toLowerCase();

    return (
      lower.includes("now_printing") ||
      lower.includes("nowprinting") ||
      lower.includes("noimage")
    );
  };

  return [
    ...images.filter((url) => !isPlaceholder(url)),
    ...images.filter(isPlaceholder),
  ];
}

function isNewProduct(product) {
  if (!product.date) {
    return false;
  }

  const published = new Date(product.date);
  const now = new Date();

  const days =
    (now - published) /
    (1000 * 60 * 60 * 24);

  return days >= 0 && days <= 30;
}

function normalizeProduct(product) {
  const genres = getItemInfoNames(product, "genre");
  const makers = getItemInfoNames(product, "maker");
  const actresses = getItemInfoNames(product, "actress");

  const price = getPrice(product);
  const listPrice = getListPrice(product);
  const tags = [];
  const review = getReview(product);
  if (price > 0 && listPrice > price) tags.push("セール");
  if (review && review.average >= 4) tags.push("高評価");

  if (isNewProduct(product)) {
    tags.push("新作");
  }

  if (product.title?.includes("独占")) {
    tags.push("独占");
  }

  genres.slice(0, 3).forEach((genre) => {
    if (!tags.includes(genre)) {
      tags.push(genre);
    }
  });

  return {
    id:
      product.content_id ||
      product.product_id ||
      product.URL,

    title:
      product.title ||
      "タイトルなし",

    maker:
      makers[0] ||
      "メーカー不明",

    genres,
    actresses,
    tags,
    price,
    listPrice,
    review,
    catalogRank: Number.isSafeInteger(product.catalogRank) && product.catalogRank > 0 ? product.catalogRank : null,

    date:
      product.date ||
      "",

    description: actresses.length
      ? `出演：${actresses.slice(0, 4).join("、")}`
      : genres.length
        ? `ジャンル：${genres.slice(0, 4).join("、")}`
        : "作品情報",

    images:
      getImageCandidates(product),

    url:
      product.affiliateURL ||
      product.URL ||
      "#",
  };
}

function updateSelectOptions(
  selectId,
  values,
  defaultText
) {
  const select = $(selectId);

  if (!select) {
    return;
  }

  const currentValue = select.value;

  const uniqueValues = [
    ...new Set(values.filter(Boolean))
  ].sort((a, b) =>
    a.localeCompare(b, "ja")
  );

  select.innerHTML =
    `<option value="">${defaultText}</option>`;

  uniqueValues.forEach((value) => {
    const option =
      document.createElement("option");

    option.value = value;
    option.textContent = value;

    select.appendChild(option);
  });

  if (uniqueValues.includes(currentValue)) {
    select.value = currentValue;
  }
}

function updateFilters() {
  updateSelectOptions(
    "genreFilter",
    products.flatMap(
      (product) => product.genres
    ),
    "すべてのジャンル"
  );

  updateSelectOptions(
    "makerFilter",
    products.map(
      (product) => product.maker
    ),
    "すべてのメーカー"
  );
}

function showMessage(message) {
  results.innerHTML = `
    <div style="
      grid-column: 1 / -1;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 18px;
      padding: 30px;
      text-align: center;
    ">
      ${message}
    </div>
  `;
}

function setProductImage(
  product,
  placeholder,
  source
) {
  if (!product.images.length) {
    placeholder.textContent = "画像なし";
    return;
  }

  const image =
    document.createElement("img");

  image.alt = product.title;
  image.loading = "lazy";
  image.decoding = "async";

  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  image.style.cursor = "pointer";

  const imageLink = document.createElement("a");
  imageLink.className = "product-image-link";
  imageLink.style.display = "block";
  imageLink.style.width = "100%";
  imageLink.style.height = "100%";
  imageLink.setAttribute("aria-label", `${product.title}をFANZAで見る`);
  bindFanzaProductLink(imageLink, product, source, "image");
  imageLink.appendChild(image);

  let imageIndex = 0;

  function loadNextImage() {
    if (
      imageIndex >=
      product.images.length
    ) {
      const fallback =
        document.createElement("div");

      fallback.className = "placeholder";
      fallback.textContent = "画像なし";

      image.replaceWith(fallback);
      return;
    }

    image.src =
      product.images[imageIndex];

    imageIndex += 1;
  }

  image.addEventListener(
    "error",
    loadNextImage
  );

  placeholder.replaceWith(imageLink);

  loadNextImage();
}
function updateLoadMoreButton(show) {
  let button = $("loadMoreBtn");

  if (!button) {
    button =
      document.createElement("button");

    button.id = "loadMoreBtn";
    button.type = "button";
    button.textContent = "検索結果をもっと見る";

    Object.assign(button.style, {
      display: "block",
      margin: "32px auto",
      padding: "14px 36px",
      border: "0",
      borderRadius: "999px",
      background: "#111",
      color: "#fff",
      fontSize: "16px",
      fontWeight: "700",
      cursor: "pointer",
    });

    button.addEventListener(
      "click",
      () => fetchProducts(true)
    );

   results.after(button);
  }

  button.style.display =
    show ? "block" : "none";

  button.disabled = false;
  button.textContent = "検索結果をもっと見る";
}

function setPageHeading(text) {
  const heading =
    document.querySelector(
      ".site-header h1"
    );

  if (heading) {
    heading.textContent = text;
  }
}

function setDefaultPageState() {
  document.title = "FANZA作品ナビ｜セール・人気作品を出演者やジャンルから検索";

  setPageHeading(
    "FANZA作品ナビ｜セール・人気作品を探す"
  );
}

function applyActressPageState(
  actress,
  pushHistory = true
) {
  const url =
    new URL(window.location.href);

  if (actress) {
    url.searchParams.set(
      "actress",
      actress
    );

    if (pushHistory) {
      pushSearchHistory(
        { actress },
        "",
        url
      );
    }

    document.title =
      `${actress}の作品一覧 | FANZA作品ナビ`;

    setPageHeading(
      `${actress}の作品を見つける`
    );

    $("keyword").value = actress;
  } else {
    url.searchParams.delete("actress");

    if (pushHistory) {
      pushSearchHistory({}, "", url);
    }

    setDefaultPageState();
  }
}

function openActressPage(actress) {
  applyActressPageState(
    actress,
    true
  );

  fetchProducts(false);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function searchByKeyword(keyword, scrollToTop = true) {
  const url =
    new URL(window.location.href);

  url.searchParams.delete("actress");

  pushSearchHistory({}, "", url);

  setDefaultPageState();

  $("keyword").value = keyword;

  fetchProducts(false);

if (scrollToTop) {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
}

document

document
  .querySelectorAll("[data-popular-keyword]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const keyword =
        button.dataset.popularKeyword || "";

      if (!keyword) {
        return;
      }

      searchByKeyword(keyword);
    });
  });

function createSearchButton(text) {
  const button =
    document.createElement("button");

  button.type = "button";
  button.textContent = text;

  Object.assign(button.style, {
    border: "0",
    background: "transparent",
    padding: "0",
    color: "inherit",
    font: "inherit",
    textDecoration: "underline",
    cursor: "pointer",
  });

  button.addEventListener(
    "click",
    () => searchByKeyword(text)
  );

  return button;
}

function setActressLinks(
  product,
  descriptionElement
) {
  descriptionElement.innerHTML = "";

  if (!product.actresses.length) {
    descriptionElement.textContent =
      product.description;

    return;
  }

  const label =
    document.createElement("span");

  label.textContent = "出演：";

  descriptionElement.appendChild(label);

  product.actresses
    .slice(0, 6)
    .forEach((actress, index) => {
      const button =
        document.createElement("button");

      button.type = "button";
      button.textContent = actress;

      Object.assign(button.style, {
        border: "0",
        background: "transparent",
        padding: "0",
        color: "#333",
        font: "inherit",
        textDecoration: "underline",
        cursor: "pointer",
      });

      button.addEventListener(
        "click",
        () => openActressPage(actress)
      );

      descriptionElement.appendChild(
        button
      );

      if (
        index <
        Math.min(
          product.actresses.length,
          6
        ) - 1
      ) {
        descriptionElement.appendChild(
          document.createTextNode("、")
        );
      }
    });
}

async function fetchProducts(
  append = false
) {
  const keyword =
    $("keyword").value.trim();
  const requestId = ++searchRequestId;

  if (!append) {
    currentKeyword = keyword;
    nextOffset = 1;
    products = [];

    $("searchBtn").disabled = true;
    $("searchBtn").textContent =
      "検索中";

    showMessage(
      "作品を読み込んでいます…"
    );
  } else {
    if (isLoadingMore) {
      return;
    }

    isLoadingMore = true;

    const loadMoreButton =
      $("loadMoreBtn");

    if (loadMoreButton) {
      loadMoreButton.disabled = true;
      loadMoreButton.textContent =
        "読み込み中…";
    }
  }

  try {
    const params =
      new URLSearchParams({
        hits: "20",
        offset: String(nextOffset),
        sort: $("sortFilter").value === "popular" ? "rank" : $("sortFilter").value === "priceLow" ? "price" : "date",
      });

    if (currentKeyword) {
      params.set(
        "keyword",
        currentKeyword
      );
    }

    const response =
      await fetch(
        `/api/search?${params.toString()}`, { signal: AbortSignal.timeout(12000) }
      );

    const data =
      await response.json();
    if (requestId !== searchRequestId) return;

    // Recommendations are owned by fetchRecommendations, not ordinary searches.
    
    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "作品情報を取得できませんでした。"
      );
    }

    const newProducts =
      asArray(data.products)
        .map(normalizeProduct);

    products = append
      ? [...products, ...newProducts]
      : newProducts;
    
products.forEach((product) => {
  if (favorites.includes(product.id)) {
    favoriteProducts[product.id] = product;
  }
});

localStorage.setItem(
  "favoriteProducts",
  JSON.stringify(favoriteProducts)
);
    nextOffset += Number(data.resultCount ?? newProducts.length);

    updateFilters();
    render();
    $("initialCatalog")?.remove();

    updateLoadMoreButton(
      newProducts.length === 20 &&
      products.length <
        Number(data.totalCount || 0)
    );
  } catch (error) {
    if (requestId !== searchRequestId) return;
    console.error(error);

    if (!append) {
      $("resultCount").textContent =
        "—";

      showMessage(
        '作品情報を取得できませんでした。メンテナンスや通信の影響が考えられます。時間をおいて再度検索してください。'
      );
    } else {
      updateLoadMoreButton(true);
      alert("追加の作品情報を取得できませんでした。時間をおいて再度お試しください。");
    }
  } finally {
    if (requestId !== searchRequestId) return;
    $("searchBtn").disabled = false;
    $("searchBtn").textContent =
      "検索";

    isLoadingMore = false;
  }
}
async function fetchRecommendations() {
  try {
    const response =
      await fetch("/api/search?mode=recommend", { signal: AbortSignal.timeout(12000) });

    const data =
      await response.json();

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
        "おすすめ作品を取得できませんでした。"
      );
    }

   recommendationProducts =
  asArray(data.products?.length ? data.products : data.recommendations)
    .map(normalizeProduct)
    .sort(() => Math.random() - 0.5);

recommendationVisibleCount = 6;

    renderRecommendations();
  } catch (error) {
    console.error(
      "おすすめ作品の取得に失敗しました。",
      error
    );
    if (!recommendationProducts.length) {
      renderRecommendations("おすすめ作品を取得できませんでした。時間をおいて再読み込みしてください。");
    }
  }
}

function renderRecommendations(message = "おすすめ作品は現在ありません。") {
  let section = document.getElementById("recommendSection");

  if (!section) {
    section = document.createElement("section");
    section.id = "recommendSection";
    section.innerHTML = `
  
   <div class="recommend-heading">
  <h2>✨ 今日のおすすめ</h2>
</div>

<div class="recommend-carousel-wrap">
  <button
    id="recommendPrevBtn"
    class="recommend-arrow recommend-arrow-prev"
    type="button"
    aria-label="前の作品を見る"
  >
    ‹
  </button>

  <div
    id="recommendResults"
    class="results recommend-carousel"
  ></div>

  <button
    id="recommendNextBtn"
    class="recommend-arrow recommend-arrow-next"
    type="button"
    aria-label="次の作品を見る"
  >
    ›
  </button>
</div> 
<button
  id="recommendMoreBtn"
  type="button"
  style="
    display:block;
    margin:32px auto;
    padding:14px 36px;
    border:0;
    border-radius:999px;
    background:#111;
    color:#fff;
    font-size:16px;
    font-weight:700;
    cursor:pointer;
  "
>
  おすすめをもっと見る
</button>
    `;

   document
  .getElementById("recommendArea")
  .replaceWith(section);
  }

  const area =
    document.getElementById("recommendResults");

  area.innerHTML = "";

  recommendationProducts
  .slice(0, recommendationVisibleCount)
  .forEach((product) => {
    const node =
      template.content.cloneNode(true);

    node.querySelector(".badge").textContent =
      "おすすめ";

    setProductTitle(node, product);

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder"),
      "recommendation"
    );

    node.querySelector(".price").textContent =
      product.price > 0
        ? `¥${product.price.toLocaleString()}〜`
        : "価格はFANZAで確認";

    const favoriteButton =
  node.querySelector(".favorite");

const isFavorite =
  favorites.includes(product.id);

favoriteButton.classList.toggle(
  "active",
  isFavorite
);

favoriteButton.textContent =
  isFavorite ? "♥" : "♡";

favoriteButton.addEventListener("click", () => {
  toggleFavorite(product);
  renderRecommendations();
});
    
    const link =
      node.querySelector(".detail-link");

    bindFanzaProductLink(link, product, "recommendation");
    
area.appendChild(node);
  });
  if (!recommendationProducts.length) {
    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = message;
    area.appendChild(status);
  }

  const prevBtn = document.getElementById("recommendPrevBtn");
const nextBtn = document.getElementById("recommendNextBtn");

const scrollRecommendations = (direction) => {
  const scrollAmount = Math.max(
    area.clientWidth * 0.8,
    260
  );

  area.scrollBy({
    left: direction * scrollAmount,
    behavior: "smooth"
  });
};

if (prevBtn) {
  prevBtn.disabled = recommendationProducts.length === 0;
  prevBtn.onclick = () => {
    scrollRecommendations(-1);
  };
}

if (nextBtn) {
  nextBtn.disabled = recommendationProducts.length === 0;
  nextBtn.onclick = () => {
    scrollRecommendations(1);
  };
}
  const moreBtn = document.getElementById("recommendMoreBtn");

if (moreBtn) {
  moreBtn.style.display =
    recommendationVisibleCount < recommendationProducts.length
      ? "block"
      : "none";

  moreBtn.onclick = () => {
    recommendationVisibleCount += 6;
    renderRecommendations();
  };
}
}
async function fetchSaleProducts() {
  try {
    const response = await fetch("/api/search?mode=sale", { signal: AbortSignal.timeout(12000) });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(
        data.error ||
        "セール作品を取得できませんでした。"
      );
    }

       saleProducts = asArray(data.products)
      .map(normalizeProduct)
      .filter((product) => {
        return (
          product.listPrice > product.price &&
          product.price > 0
        );
      })
      .sort((a, b) => {
        const discountA = 1 - a.price / a.listPrice;
        const discountB = 1 - b.price / b.listPrice;

        return discountB - discountA;
      })
      .slice(0, 60)
      .sort(() => Math.random() - 0.5);
    
saleVisibleCount = 6;
   renderSaleProducts(saleProducts);
renderRelatedProducts(); 
  } catch (error) {
    console.error(
      "セール作品の取得に失敗しました。",
      error
    );
    $("saleNavigationStatus").textContent = "セール作品を取得できませんでした。時間をおいてページを再読み込みしてください。";
  }
}

function renderSaleProducts(saleProducts) {
  let section =
    document.getElementById("saleSection");

  if (!section) {
    section = document.createElement("section");
    section.id = "saleSection";

    section.innerHTML = `
      <div class="recommend-heading">
        <h2>🔥 セール作品</h2>
      </div>

      <div
        id="saleResults"
        class="results"
      ></div>
           <button
        id="saleMoreBtn"
        type="button"
        style="
          display:block;
          margin:32px auto;
          padding:14px 36px;
          border:0;
          border-radius:999px;
          background:#111;
          color:#fff;
          font-size:16px;
          font-weight:700;
          cursor:pointer;
        "
      >
        セール作品をもっと見る
      </button> 
    `;

    // The anchor exists before the API resolves, including empty/error states.
    $("saleBrowse").appendChild(section);
  }

  const area =
    document.getElementById("saleResults");

  area.innerHTML = "";

 saleProducts
  .slice(0, saleVisibleCount)
  .forEach((product) => {
    const node =
      template.content.cloneNode(true);

    const discountRate = Math.round(
      (1 - product.price / product.listPrice) * 100
    );

       const saleBadge =
      node.querySelector(".badge");

    saleBadge.textContent =
      `${discountRate}%OFF`;

    Object.assign(saleBadge.style, {
      background: "#e60023",
      color: "#fff",
      fontWeight: "800",
      fontSize: "14px",
      padding: "6px 10px",
      borderRadius: "999px",
      boxShadow: "0 3px 10px rgba(230, 0, 35, 0.25)",
    });
    
    setProductTitle(node, product);

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder"),
      "sale"
    );

      const priceElement =
      node.querySelector(".price");

    priceElement.innerHTML = `
      <span style="
        color:#e60023;
        font-size:22px;
        font-weight:800;
      ">
        ¥${product.price.toLocaleString()}〜
      </span>
      <br>
      <span style="
        color:#777;
        font-size:13px;
        text-decoration:line-through;
      ">
        通常 ¥${product.listPrice.toLocaleString()}
      </span>
    `;
    
    const favoriteButton =
      node.querySelector(".favorite");

    const isFavorite =
      favorites.includes(product.id);

    favoriteButton.classList.toggle(
      "active",
      isFavorite
    );

    favoriteButton.textContent =
      isFavorite ? "♥" : "♡";

    favoriteButton.addEventListener(
      "click",
      () => {
        toggleFavorite(product);
        renderSaleProducts(saleProducts);
      }
    );

    const link =
      node.querySelector(".detail-link");

    bindFanzaProductLink(link, product, "sale");

    area.appendChild(node);
  });

  $("saleNavigationStatus").textContent = saleProducts.length
    ? "" : "現在の取得結果にセール対象作品はありません。";
  section.style.display =
    saleProducts.length ? "block" : "none";
    const moreBtn = document.getElementById("saleMoreBtn");

  if (moreBtn) {
    moreBtn.style.display =
      saleVisibleCount < saleProducts.length
        ? "block"
        : "none";

    moreBtn.onclick = () => {
      saleVisibleCount += 6;
      renderSaleProducts(saleProducts);
    };
  }
}
function saveRelatedSource(product) {
  relatedSourceProduct = product;

  localStorage.setItem(
    "relatedSourceProduct",
    JSON.stringify(product)
  );

  renderRelatedProducts();
}

function getRelatedScore(product, sourceProduct) {
  let score = 0;

  const sameActresses = product.actresses.filter(
    (actress) =>
      sourceProduct.actresses.includes(actress)
  );

  const sameGenres = product.genres.filter(
    (genre) =>
      sourceProduct.genres.includes(genre)
  );

  score += sameActresses.length * 10;
  score += sameGenres.length * 3;

  if (
    product.maker &&
    product.maker === sourceProduct.maker
  ) {
    score += 2;
  }

  return score;
}

function renderRelatedProducts() {
  let section =
    document.getElementById("relatedSection");

  if (!relatedSourceProduct) {
    if (section) {
      section.style.display = "none";
    }

    return;
  }

  const productMap = new Map();

  [
    ...products,
    ...recommendationProducts,
    ...saleProducts,
  ].forEach((product) => {
    if (
      product?.id &&
      product.id !== relatedSourceProduct.id
    ) {
      productMap.set(product.id, product);
    }
  });

  const relatedProducts = [
    ...productMap.values(),
  ]
    .map((product) => ({
      product,
      score: getRelatedScore(
        product,
        relatedSourceProduct
      ),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((item) => item.product);

  if (!relatedProducts.length) {
    if (section) {
      section.style.display = "none";
    }

    return;
  }

  if (!section) {
    section = document.createElement("section");
    section.id = "relatedSection";

    const saleSection =
      document.getElementById("saleSection");

    if (saleSection) {
      saleSection.after(section);
    } else {
      results.before(section);
    }
  }

  section.style.display = "block";

  section.innerHTML = `
    <div class="recommend-heading">
      <h2>🔍 この作品に近いおすすめ</h2>
      <p style="
        margin:6px 0 20px;
        color:#666;
        font-size:14px;
      ">
        「${relatedSourceProduct.title}」に近い作品
      </p>
    </div>

    <div
      id="relatedResults"
      class="results"
    ></div>
  `;

  const area =
    document.getElementById("relatedResults");

  relatedProducts.forEach((product) => {
    const node =
      template.content.cloneNode(true);

    node.querySelector(".badge").textContent =
      "関連作品";

    setProductTitle(node, product);

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder"),
      "related"
    );

    node.querySelector(".price").textContent =
      product.price > 0
        ? `¥${product.price.toLocaleString()}〜`
        : "価格はFANZAで確認";

    const favoriteButton =
      node.querySelector(".favorite");

    const isFavorite =
      favorites.includes(product.id);

    favoriteButton.classList.toggle(
      "active",
      isFavorite
    );

    favoriteButton.textContent =
      isFavorite ? "♥" : "♡";

    favoriteButton.addEventListener(
      "click",
      () => {
        toggleFavorite(product);
        renderRelatedProducts();
      }
    );

    const link =
      node.querySelector(".detail-link");

    bindFanzaProductLink(link, product, "related");

    area.appendChild(node);
  });
}

function render() {
  document.querySelectorAll("[data-chip]").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.chip === activeChip);
    chip.setAttribute("aria-pressed", String(chip.dataset.chip === activeChip));
  });
  const genre =
    $("genreFilter").value;

  const maker =
    $("makerFilter").value;

  const sort =
    $("sortFilter").value;
  
const historyProducts = JSON.parse(
  localStorage.getItem("viewHistory") || "[]"
);

let filtered = showHistoryOnly
  ? historyProducts
  : showFavoritesOnly
    ? Object.values(favoriteProducts).filter((product) =>
        favorites.includes(product.id)
      )
    : products.filter((product) => {
      return (
        (
          !genre ||
          product.genres.includes(genre)
        ) &&
        (
          !maker ||
          product.maker === maker
        ) &&
        (
          !activeChip ||
          product.tags.includes(activeChip)
        )
      );
    });
  
  filtered.sort((a, b) => {
    if (sort === "popular") {
      return (a.catalogRank ?? Infinity) - (b.catalogRank ?? Infinity) || 0;
    }
    if (sort === "priceLow") {
      return (a.price || Infinity) - (b.price || Infinity) || 0;
    }

    return (
      new Date(b.date || 0) -
      new Date(a.date || 0)
    );
  });

  results.innerHTML = "";

  filtered.forEach((product) => {
    const node =
      template.content.cloneNode(true);

    node.querySelector(
      ".badge"
    ).textContent =
      (showHistoryOnly || showFavoritesOnly ? "保存済み" : product.tags[0]) ||
      product.genres[0] ||
      "作品";

    const meta =
      node.querySelector(".meta");

    meta.innerHTML = "";

    meta.appendChild(
      createSearchButton(
        product.maker
      )
    );

    if (product.date) {
      meta.appendChild(
        document.createTextNode(
          ` / ${product.date.slice(0, 10)}`
        )
      );
    }

    setProductTitle(node, product);

    setActressLinks(
      product,
      node.querySelector(
        ".description"
      )
    );

    setProductImage(
      product,
      node.querySelector(
        ".placeholder"
      ),
      showHistoryOnly ? "history" : showFavoritesOnly ? "favorites" : "search"
    );

    const tags =
      node.querySelector(".tags");

    product.tags
      .filter(tag => !(showHistoryOnly || showFavoritesOnly) || tag !== "セール")
      .slice(0, 5)
      .forEach((tag) => {
        if (
          product.genres.includes(tag)
        ) {
          const button =
            createSearchButton(tag);

          button.className =
            "tag-search-button";

          tags.appendChild(button);
        } else {
          const span =
            document.createElement(
              "span"
            );

          span.textContent = tag;

          tags.appendChild(span);
        }
      });

    node.querySelector(
      ".price"
    ).textContent =
      product.price > 0
        ? `${showHistoryOnly || showFavoritesOnly ? "保存時の参考価格 " : ""}¥${product.price.toLocaleString()}〜`
        : "価格はFANZAで確認";

    node.querySelector(
      ".rating"
    ).textContent =
      product.listPrice >
        product.price &&
      product.price > 0
        ? `${showHistoryOnly || showFavoritesOnly ? "保存時の" : ""}通常 ¥${product.listPrice.toLocaleString()}`
        : "";
    if (product.review) {
      node.querySelector(".rating").textContent += ` 評価 ${product.review.average} / 5（${product.review.count}件）`;
    }

    const favoriteButton =
      node.querySelector(
        ".favorite"
      );

    const isFavorite =
      favorites.includes(
        product.id
      );

    favoriteButton.classList.toggle(
      "active",
      isFavorite
    );

    favoriteButton.textContent =
      isFavorite ? "♥" : "♡";

   favoriteButton.addEventListener("click", () => {
  const wasFavorite = favorites.includes(product.id);

  toggleFavorite(product);
     
  if (!wasFavorite) {
    fetch("/api/favorite", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content_id: product.id,
        title: product.title,
        actress: product.actresses?.join(", ") || "",
        maker: product.maker || "",
        genre: product.genres?.join(", ") || "",
      }),
    }).catch((error) => {
      console.error(
        "お気に入り記録に失敗しました:",
        error
      );
    });
  }
});

    const detailLink =
      node.querySelector(
        ".detail-link"
      );

    bindFanzaProductLink(detailLink, product, showHistoryOnly ? "history" : showFavoritesOnly ? "favorites" : "search");
      if (showHistoryOnly) {
      const removeButton = document.createElement("button");

      removeButton.textContent = "🗑 履歴から削除";
      removeButton.className = "favorite";
      removeButton.style.marginTop = "8px";

      removeButton.addEventListener("click", () => {
        removeFromHistory(product.id);
      });

      node.querySelector(".card").appendChild(removeButton);
    }  
    results.appendChild(node);   
    
  });

  $("filterStatus").textContent = showFavoritesOnly || showHistoryOnly
    ? "保存済み作品を表示。人気順は保存時に取得したFANZA順位のある作品を優先します。"
    : `絞り込みは読み込み済み${products.length}件が対象です。セール：同じ配信形式で通常価格より安い作品。高評価：FANZAの評価4.0以上・レビュー1件以上。評価未取得の作品は対象外です。${sort === "popular" ? " 人気順はFANZA APIの人気順です。" : ""}`;
  $("resultCount").textContent =
    filtered.length;

 $("favoriteCount").textContent =
  favorites.length;

const favoriteCountElement = $("favoriteCount");

if (favoriteCountElement) {
  favoriteCountElement.textContent = favorites.length;
}

if (!filtered.length) {
    showMessage(
      activeChip === "高評価" ? "取得済み作品に評価4.0以上のレビューを確認できません。評価未取得の作品には点数を付けていません。「高評価」を解除するか、さらに作品を読み込んでください。" : "条件に一致する作品がありません。条件を解除するか、さらに作品を読み込んでください。"
    );
  }
}
function removeFromHistory(productId) {
  const history = JSON.parse(
    localStorage.getItem("viewHistory") || "[]"
  ).filter((item) => item.id !== productId);

  localStorage.setItem(
    "viewHistory",
    JSON.stringify(history)
  );

  render();
}
function clearHistory() {
  localStorage.removeItem("viewHistory");
  showHistoryOnly = false;

  $("historyBtn").textContent = "🕘 閲覧履歴";

  render();
}
function toggleFavorite(product) {
  const id = product.id;

  if (favorites.includes(id)) {
    favorites = favorites.filter(
      (favoriteId) => favoriteId !== id
    );

    delete favoriteProducts[id];
  } else {
    favorites = [...favorites, id];
    favoriteProducts[id] = product;
  }

  localStorage.setItem(
    "favorites",
    JSON.stringify(favorites)
  );

localStorage.setItem(
  "favorites",
  JSON.stringify(favorites)
);

localStorage.setItem(
  "favoriteProducts",
  JSON.stringify(favoriteProducts)
);

render();
}
$("searchBtn").addEventListener(
  "click",
  () => {
    const url =
      new URL(window.location.href);

    url.searchParams.delete(
      "actress"
    );

    pushSearchHistory(
      {},
      "",
      url
    );

    setDefaultPageState();
    fetchProducts(false);
  }
);

$("keyword").addEventListener(
  "keydown",
  (event) => {
 const items = autocompleteList.querySelectorAll(".autocomplete-item");

if (event.key === "ArrowDown") {
  event.preventDefault();

  autocompleteIndex = Math.min(
    autocompleteIndex + 1,
    items.length - 1
  );
}

 if (event.key === "ArrowUp") {
  event.preventDefault();

  autocompleteIndex = Math.max(
    autocompleteIndex - 1,
    0
  );
}

items.forEach((item, index) => {
  item.classList.toggle(
    "active",
    index === autocompleteIndex
  );
});
    
    if (event.key === "Enter") {
      const url =
        new URL(
          window.location.href
        );

      url.searchParams.delete(
        "actress"
      );

      pushSearchHistory(
        {},
        "",
        url
      );

      setDefaultPageState();

if (autocompleteIndex >= 0 && items[autocompleteIndex]) {
  event.preventDefault();

  $("keyword").value =
    items[autocompleteIndex].textContent;

  autocompleteList.innerHTML = "";
  autocompleteList.style.display = "none";

  fetchProducts(false);
  return;
}
      
      fetchProducts(false);
    }
  }
);
let autocompleteTimer = null;

$("keyword").addEventListener("input", () => {
  const keyword = $("keyword").value.trim();

  clearTimeout(autocompleteTimer);
  autocompleteIndex = -1;

  if (!keyword) {
    autocompleteList.innerHTML = "";
    autocompleteList.style.display = "none";
    return;
  }

  autocompleteTimer = setTimeout(async () => {
    try {
      const params = new URLSearchParams({
        keyword,
        hits: "20",
        offset: "1",
      });

      const response = await fetch(
        `/api/search?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.error || "候補を取得できませんでした。"
        );
      }

      const lowerKeyword = keyword.toLowerCase();

      const actressNames = [
        ...new Set(
          asArray(data.products)
            .flatMap((product) =>
              getItemInfoNames(product, "actress")
            )
            .filter((actress) =>
              actress
                .toLowerCase()
                .includes(lowerKeyword)
            )
        ),
      ].slice(0, 5);

      autocompleteList.innerHTML = "";

      if (!actressNames.length) {
        autocompleteList.style.display = "none";
        return;
      }

      actressNames.forEach((actress) => {
        const item = document.createElement("div");

        item.textContent = actress;
        item.className = "autocomplete-item";

        item.addEventListener("click", () => {
          autocompleteList.innerHTML = "";
          autocompleteList.style.display = "none";

         applyActressPageState(actress, true);
　　　　　fetchProducts(false);
        });

        item.addEventListener("mouseenter", () => {
          item.classList.add("active");
        });

        item.addEventListener("mouseleave", () => {
          item.classList.remove("active");
        });

        autocompleteList.appendChild(item);
      });

      autocompleteList.classList.remove("hidden");
      autocompleteList.style.display = "block";
    } catch (error) {
      console.error(
        "オートコンプリート取得に失敗しました。",
        error
      );

      autocompleteList.innerHTML = "";
      autocompleteList.style.display = "none";
    }
  }, 300);
});
 
document.addEventListener("click", (event) => {
  if (!autocompleteList.contains(event.target) && event.target !== $("keyword")) {
    autocompleteList.innerHTML = "";
    autocompleteList.style.display = "none";
  }
});
[
  "genreFilter",
  "makerFilter",
].forEach((id) => {
  $(id).addEventListener(
    "change",
    render
  );
});

$("sortFilter").addEventListener("change", () => {
  if (showFavoritesOnly || showHistoryOnly) render();
  else fetchProducts(false);
});

$("keyword").addEventListener("focus", () => {
  if (autocompleteList.children.length > 0) {
    autocompleteList.style.display = "block";
  }
});

document
  .querySelectorAll("[data-chip]")
  .forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        activeChip =
          activeChip ===
          button.dataset.chip
            ? ""
            : button.dataset.chip;

window.addEventListener("scroll", () => {
  autocompleteList.style.display = "none";
});

window.addEventListener("resize", () => {
  autocompleteList.style.display = "none";
});

 $("keyword").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    autocompleteList.innerHTML = "";
    autocompleteList.style.display = "none";
  }
});

autocompleteList.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

$("keyword").setAttribute("autocomplete", "off");
$("keyword").setAttribute("spellcheck", "false");   
$("keyword").setAttribute("autocapitalize", "off");
$("keyword").setAttribute("autocorrect", "off");
$("keyword").setAttribute("autocomplete", "new-password");        
        document
          .querySelectorAll(
            "[data-chip]"
          )
          .forEach((chip) => {
            chip.classList.toggle(
              "active",
              chip.dataset.chip ===
                activeChip
            );
            chip.setAttribute("aria-pressed", String(chip.dataset.chip === activeChip));
          });

        render();
      }
    );
  });

document
  .querySelectorAll("[data-mood]")
  .forEach((button) => {
    button.addEventListener("click", () => {
      const moodKeywords = {
        イチャイチャ: "イチャイチャ",
        激しい: "ハード",
        人妻: "人妻",
        清楚: "清楚",
        新人: "新人",
      };

      let selectedMood = button.dataset.mood;
      let keyword = moodKeywords[selectedMood];

      const moodIcons = {
  イチャイチャ: "❤️",
  激しい: "🔥",
  人妻: "👩",
  清楚: "🌸",
  新人: "✨",
  おまかせ: "🎲",
};
      if (selectedMood === "おまかせ") {
        const moods = Object.values(moodKeywords);
        keyword =
          moods[Math.floor(Math.random() * moods.length)];
      }
      
$("activeMoodText").textContent =
  `${moodIcons[selectedMood]} ${selectedMood}作品を表示中`;

$("activeMood").classList.remove("hidden");
     document
  .querySelectorAll("[data-mood]")
  .forEach((moodButton) => {
    moodButton.classList.toggle(
      "active",
      moodButton === button
    );
  }); 
     searchByKeyword(keyword, false); 
    });
  });
$("resetBtn").addEventListener(
  "click",
  () => {
    $("keyword").value = "";
    $("genreFilter").value = "";
    $("makerFilter").value = "";
    $("sortFilter").value = "new";

    activeChip = "";

    document
      .querySelectorAll(
        "[data-chip]"
      )
      .forEach((button) => {
        button.classList.remove(
          "active"
        );
      });

    const url =
      new URL(window.location.href);

    url.searchParams.delete(
      "actress"
    );

    pushSearchHistory(
      {},
      "",
      url
    );

    setDefaultPageState();
    fetchProducts(false);
  }
);

let showFavoritesOnly = false;

$("favoritesBtn").addEventListener("click", () => {
  showFavoritesOnly = !showFavoritesOnly;
  showHistoryOnly = false;

  $("favoritesBtn").innerHTML = showFavoritesOnly
    ? `♡ すべて表示 <span id="favoriteCount" hidden>${favorites.length}</span>`
    : `♡ お気に入り <span id="favoriteCount">${favorites.length}</span>`;

  $("historyBtn").textContent = "🕘 閲覧履歴";

  $("keyword").value = "";
  $("genreFilter").value = "";
  $("makerFilter").value = "";
  activeChip = "";

  render();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

$("historyBtn").addEventListener("click", () => {
  showHistoryOnly = !showHistoryOnly;
  showFavoritesOnly = false;

  $("historyBtn").textContent = showHistoryOnly
    ? "🕘 すべて表示"
    : "🕘 閲覧履歴";

  $("favoritesBtn").innerHTML = `♡ お気に入り <span id="favoriteCount">${favorites.length}</span>`;

  $("keyword").value = "";
  $("genreFilter").value = "";
  $("makerFilter").value = "";
  activeChip = "";

  render();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
});

$("clearMoodBtn").addEventListener("click", () => {
  $("activeMood").classList.add("hidden");
  $("activeMoodText").textContent = "";
  $("keyword").value = "";

  document
    .querySelectorAll("[data-mood]")
    .forEach((button) => {
      button.classList.remove("active");
    });

  fetchProducts(false);
});
$("enterBtn").addEventListener(
  "click",
  () => {
    localStorage.setItem(
      "ageConfirmed",
      "1"
    );

    $("ageGate").classList.add(
      "hidden"
    );
    $("topQuickNav").inert = false;
  }
);

$("leaveBtn").addEventListener(
  "click",
  () => {
    location.href =
      "https://www.google.com/";
  }
);

window.addEventListener(
  "popstate",
  () => {
    // Hash-only shortcuts and their Back/Forward navigation must preserve search state.
    if (navigationSearch === window.location.search) return;
    navigationSearch = window.location.search;
    const actress =
      new URLSearchParams(
        window.location.search
      ).get("actress");

    if (actress) {
      applyActressPageState(
        actress,
        false
      );
    } else {
      $("keyword").value = "";
      setDefaultPageState();
    }

   fetchProducts(false);
　　renderRecommendations();
  }
);

if (
  localStorage.getItem(
    "ageConfirmed"
  ) === "1"
) {
  $("ageGate").classList.add(
    "hidden"
  );
  $("topQuickNav").inert = false;
}

const actressFromUrl =
  new URLSearchParams(
    window.location.search
  ).get("actress");

if (actressFromUrl) {
  applyActressPageState(
    actressFromUrl,
    false
  );
} else {
  setDefaultPageState();
}

fetchProducts(false);
fetchRecommendations();

fetchSaleProducts();

