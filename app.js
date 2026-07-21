let products = [];
let recommendationProducts = [];
let recommendationVisibleCount = 6;
let activeChip = "";
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

let nextOffset = 1;
let currentKeyword = "";
let isLoadingMore = false;

const $ = (id) => document.getElementById(id);
const results = $("results");
const template = $("cardTemplate");

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

  if (listPrice > price && price > 0) {
    tags.push("セール");
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
    .map(normalizeProduct);

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
      <h2 style="margin:40px 0 20px;">
        ✨ おすすめ作品
      </h2>
      <div id="recommendResults" class="results"></div>
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

    const link =
      node.querySelector(".detail-link");

    link.href = product.url;
    link.target = "_blank";

    area.appendChild(node);
  });
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

function render() {
  const genre =
    $("genreFilter").value;

  const maker =
    $("makerFilter").value;

  const sort =
    $("sortFilter").value;
  
let filtered = showFavoritesOnly
  ? products.filter((product) =>
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

  toggleFavorite(product.id);

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
    results.appendChild(node);

    
   
    
  });

  $("resultCount").textContent =
    filtered.length;

  $("favoriteCount").textContent =
    favorites.length;

  if (!filtered.length) {
    showMessage(
      "条件に一致する作品がありません。"
    );
  }
}
function toggleFavorite(id) {
  favorites = favorites.includes(id)
    ? favorites.filter(
        (favoriteId) =>
          favoriteId !== id
      )
    : [...favorites, id];

  localStorage.setItem(
    "favorites",
    JSON.stringify(favorites)
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

  $("favoritesBtn").textContent = showFavoritesOnly
    ? "♡ すべて表示"
    : `♡ お気に入り ${favorites.length}`;

  render();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
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
