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

const $ = (id) => document.getElementById(id);
const results = $("results");
const template = $("cardTemplate");
const autocompleteList = $("autocompleteList");
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

function toNumber(value) {
  if (value == null) return 0;
  return Number(String(value).replace(/[^\d]/g, "")) || 0;
}

function getDeliveries(product) {
  return asArray(product?.prices?.deliveries?.delivery);
}

function getPrice(product) {
  const directPrice = toNumber(product?.prices?.price);

  if (directPrice > 0) {
    return directPrice;
  }

  const deliveryPrices = getDeliveries(product)
    .map((delivery) => toNumber(delivery?.price))
    .filter((price) => price > 0);

  return deliveryPrices.length
    ? Math.min(...deliveryPrices)
    : 0;
}

function getListPrice(product) {
  const directPrice = toNumber(product?.prices?.list_price);

  if (directPrice > 0) {
    return directPrice;
  }

  const deliveryPrices = getDeliveries(product)
    .map((delivery) => toNumber(delivery?.list_price))
    .filter((price) => price > 0);

  return deliveryPrices.length
    ? Math.max(...deliveryPrices)
    : 0;
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
  placeholder
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

  image.addEventListener("click", () => {
   const history = JSON.parse(
  localStorage.getItem("viewHistory") || "[]"
);

const newHistory = [
  product,
  ...history.filter((item) => item.id !== product.id),
].slice(0, 50);

localStorage.setItem(
  "viewHistory",
  JSON.stringify(newHistory)
);
    
    window.open(
      product.url,
      "_blank",
      "noopener,noreferrer"
    );
  });

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

  placeholder.replaceWith(image);

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
  document.title = "FANZA作品ナビ";

  setPageHeading(
    "今日は何を見る？30秒で見つけよう。"
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
      history.pushState(
        { actress },
        "",
        url
      );
    }

    document.title =
      `${actress}の作品一覧 | FANZA作品発見サイト`;

    setPageHeading(
      `${actress}の作品を見つける`
    );

    $("keyword").value = actress;
  } else {
    url.searchParams.delete("actress");

    if (pushHistory) {
      history.pushState({}, "", url);
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

function searchByKeyword(keyword) {
  const url =
    new URL(window.location.href);

  url.searchParams.delete("actress");

  history.pushState({}, "", url);

  setDefaultPageState();

  $("keyword").value = keyword;

  fetchProducts(false);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

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
      });

    if (currentKeyword) {
      params.set(
        "keyword",
        currentKeyword
      );
    }

    const response =
      await fetch(
        `/api/search?${params.toString()}`
      );

    const data =
      await response.json();
    
　　if (!append) {
 　　 recommendationProducts = asArray(data.recommendations).map(normalizeProduct);
  　　renderRecommendations();
　　}
    
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
    nextOffset +=
      newProducts.length;

    updateFilters();
    render();

    updateLoadMoreButton(
      newProducts.length === 20 &&
      products.length <
        Number(data.totalCount || 0)
    );
  } catch (error) {
    console.error(error);

    if (!append) {
      $("resultCount").textContent =
        "0";

      showMessage(
        `作品情報を取得できませんでした。<br><small>${error.message}</small>`
      );
    } else {
      alert(error.message);
    }
  } finally {
    $("searchBtn").disabled = false;
    $("searchBtn").textContent =
      "検索";

    isLoadingMore = false;
  }
}
async function fetchRecommendations() {
  try {
    const response =
      await fetch("/api/search?mode=recommend");

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
  }
}

function renderRecommendations() {
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

    node.querySelector("h3").textContent =
      product.title;

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder")
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

   link.href = product.url;
link.target = "_blank";
link.rel = "noopener noreferrer sponsored";
link.addEventListener("click", () => {
  saveRelatedSource(product);
  const history = JSON.parse(
    localStorage.getItem("viewHistory") || "[]"
  );

  const newHistory = [
    product,
    ...history.filter((item) => item.id !== product.id),
  ].slice(0, 50);

  localStorage.setItem(
    "viewHistory",
    JSON.stringify(newHistory)
  );
});
    
area.appendChild(node);
  });
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
  prevBtn.onclick = () => {
    scrollRecommendations(-1);
  };
}

if (nextBtn) {
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
    const response = await fetch("/api/search?mode=sale");

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

    const recommendSection =
      document.getElementById("recommendSection");

    if (recommendSection) {
      recommendSection.after(section);
    } else {
      results.before(section);
    }
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
    
    node.querySelector("h3").textContent =
      product.title;

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder")
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

    link.href = product.url;
    link.target = "_blank";
    link.rel =
      "noopener noreferrer sponsored";

    link.addEventListener("click", () => {
  saveRelatedSource(product);
      const history = JSON.parse(
        localStorage.getItem("viewHistory") ||
        "[]"
      );

      const newHistory = [
        product,
        ...history.filter(
          (item) => item.id !== product.id
        ),
      ].slice(0, 50);

      localStorage.setItem(
        "viewHistory",
        JSON.stringify(newHistory)
      );
    });

    area.appendChild(node);
  });

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

    node.querySelector("h3").textContent =
      product.title;

    setActressLinks(
      product,
      node.querySelector(".description")
    );

    setProductImage(
      product,
      node.querySelector(".placeholder")
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

    link.href = product.url;
    link.target = "_blank";
    link.rel =
      "noopener noreferrer sponsored";

    link.addEventListener("click", () => {
      saveRelatedSource(product);
    });

    area.appendChild(node);
  });
}

function render() {
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
    if (sort === "priceLow") {
      return a.price - b.price;
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
      product.tags[0] ||
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

    node.querySelector(
      "h3"
    ).textContent = product.title;

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
      )
    );

    const tags =
      node.querySelector(".tags");

    product.tags
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
        ? `¥${product.price.toLocaleString()}〜`
        : "価格はFANZAで確認";

    node.querySelector(
      ".rating"
    ).textContent =
      product.listPrice >
        product.price &&
      product.price > 0
        ? `通常 ¥${product.listPrice.toLocaleString()}`
        : "";

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

    detailLink.href =
      product.url;

    detailLink.target =
      "_blank";

    detailLink.rel =
      "noopener noreferrer sponsored";
  
    detailLink.addEventListener("click", () => {
  saveRelatedSource(product);
     const history = JSON.parse(
  localStorage.getItem("viewHistory") || "[]"
);

const newHistory = [
  product,
  ...history.filter((item) => item.id !== product.id),
].slice(0, 50);

localStorage.setItem(
  "viewHistory",
  JSON.stringify(newHistory)
);
      fetch("/api/click", {
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
    console.error("クリック記録に失敗しました:", error);
  });
});
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
      "条件に一致する作品がありません。"
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

    history.pushState(
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
    if (event.key === "Enter") {
      const url =
        new URL(
          window.location.href
        );

      url.searchParams.delete(
        "actress"
      );

      history.pushState(
        {},
        "",
        url
      );

      setDefaultPageState();
      fetchProducts(false);
    }
  }
);
$("keyword").addEventListener(
  "input",
  () => {
const keyword = $("keyword").value.trim();
if (!keyword) {
  autocompleteList.innerHTML = "";
  autocompleteList.style.display = "none";
  return;
}
    
  const matchedProducts = products.filter((product) =>
  product.title.toLowerCase().includes(keyword.toLowerCase())
);
console.log("products:", products.length, "matched:", matchedProducts.length);    
matchedProducts.slice(0, 5).forEach((product) => {
  const item = document.createElement("div");

  item.textContent = product.title;
  item.className = "autocomplete-item";

  item.addEventListener("click", () => {
  $("keyword").value = product.title;
  autocompleteList.innerHTML = "";
  fetchProducts(false);
});
  
autocompleteList.classList.remove("hidden");
autocompleteList.appendChild(item);
autocompleteList.style.display = "block";
  
 item.addEventListener("mouseenter", () => {
  item.classList.add("active");
});

item.addEventListener("mouseleave", () => {
  item.classList.remove("active");
});
  
}); 
if (matchedProducts.length === 0) {
  autocompleteList.style.display = "none";
}    
  }
);
document.addEventListener("click", (event) => {
  if (!autocompleteList.contains(event.target) && event.target !== $("keyword")) {
    autocompleteList.innerHTML = "";
    autocompleteList.style.display = "none";
  }
});
[
  "genreFilter",
  "makerFilter",
  "sortFilter",
].forEach((id) => {
  $(id).addEventListener(
    "change",
    render
  );
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
      searchByKeyword(keyword);
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

    history.pushState(
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
