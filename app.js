let products = [];
let activeChip = "";
let favorites = JSON.parse(localStorage.getItem("favorites") || "[]");

const $ = (id) => document.getElementById(id);
const results = $("results");
const template = $("cardTemplate");

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getItemInfoNames(product, key) {
  return asArray(product?.iteminfo?.[key])
    .map((item) => item?.name)
    .filter(Boolean);
}

function getPrice(product) {
  const value =
    product?.prices?.price ??
    product?.prices?.deliveries?.delivery?.[0]?.price ??
    0;

  return Number(String(value).replace(/,/g, "")) || 0;
}

function getListPrice(product) {
  const value =
    product?.prices?.list_price ??
    product?.prices?.deliveries?.delivery?.[0]?.list_price ??
    0;

  return Number(String(value).replace(/,/g, "")) || 0;
}

function isNewProduct(product) {
  if (!product.date) return false;

  const published = new Date(product.date);
  const now = new Date();
  const days = (now - published) / (1000 * 60 * 60 * 24);

  return days >= 0 && days <= 30;
}

function normalizeProduct(product) {
  const genres = getItemInfoNames(product, "genre");
  const makers = getItemInfoNames(product, "maker");
  const actresses = getItemInfoNames(product, "actress");

  const price = getPrice(product);
  const listPrice = getListPrice(product);

  const tags = [];

  if (isNewProduct(product)) tags.push("新作");
  if (listPrice > price && price > 0) tags.push("セール");
  if (product.title?.includes("独占")) tags.push("独占");

  genres.slice(0, 3).forEach((genre) => {
    if (!tags.includes(genre)) tags.push(genre);
  });

  return {
    id: product.content_id || product.product_id,
    title: product.title || "タイトルなし",
    maker: makers[0] || "メーカー不明",
    genres,
    actresses,
    tags,
    price,
    listPrice,
    date: product.date || "",
    description: actresses.length
      ? `出演：${actresses.slice(0, 4).join("、")}`
      : genres.length
        ? `ジャンル：${genres.slice(0, 4).join("、")}`
        : "作品情報",
    image:
      product?.imageURL?.large ||
      product?.imageURL?.list ||
      product?.imageURL?.small ||
      "",
    url: product.affiliateURL || product.URL || "#",
  };
}

function updateSelectOptions(selectId, values, defaultText) {
  const select = $(selectId);
  const currentValue = select.value;

  const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ja")
  );

  select.innerHTML = `<option value="">${defaultText}</option>`;

  uniqueValues.forEach((value) => {
    const option = document.createElement("option");
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
    products.flatMap((product) => product.genres),
    "すべてのジャンル"
  );

  updateSelectOptions(
    "makerFilter",
    products.map((product) => product.maker),
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

async function fetchProducts() {
  const keyword = $("keyword").value.trim();

  $("searchBtn").disabled = true;
  $("searchBtn").textContent = "検索中";
  showMessage("作品を読み込んでいます…");

  try {
    const params = new URLSearchParams({
      hits: "20",
    });

    if (keyword) {
      params.set("keyword", keyword);
    }

    const response = await fetch(`/api/search?${params.toString()}`);
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "作品情報を取得できませんでした。");
    }

    products = asArray(data.products).map(normalizeProduct);

    updateFilters();
    render();
  } catch (error) {
    console.error(error);
    $("resultCount").textContent = "0";
    showMessage(
      `作品情報を取得できませんでした。<br><small>${error.message}</small>`
    );
  } finally {
    $("searchBtn").disabled = false;
    $("searchBtn").textContent = "検索";
  }
}

function render() {
  const genre = $("genreFilter").value;
  const maker = $("makerFilter").value;
  const sort = $("sortFilter").value;

  let filtered = products.filter((product) => {
    return (
      (!genre || product.genres.includes(genre)) &&
      (!maker || product.maker === maker) &&
      (!activeChip || product.tags.includes(activeChip))
    );
  });

  filtered.sort((a, b) => {
    if (sort === "priceLow") {
      return a.price - b.price;
    }

    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  results.innerHTML = "";

  filtered.forEach((product) => {
    const node = template.content.cloneNode(true);

    node.querySelector(".badge").textContent =
      product.tags[0] || product.genres[0] || "作品";

    node.querySelector(".meta").textContent =
      `${product.maker}${product.date ? ` / ${product.date.slice(0, 10)}` : ""}`;

    node.querySelector("h3").textContent = product.title;
    node.querySelector(".description").textContent = product.description;

    const placeholder = node.querySelector(".placeholder");

    if (product.image) {
      const image = document.createElement("img");
      image.src = product.image;
      image.alt = product.title;
      image.loading = "lazy";
      image.style.width = "100%";
      image.style.height = "100%";
      image.style.objectFit = "cover";
      placeholder.replaceWith(image);
    }

    const tags = node.querySelector(".tags");

    product.tags.slice(0, 5).forEach((tag) => {
      const span = document.createElement("span");
      span.textContent = tag;
      tags.appendChild(span);
    });

    node.querySelector(".price").textContent =
      product.price > 0
        ? `¥${product.price.toLocaleString()}`
        : "価格はFANZAで確認";

    node.querySelector(".rating").textContent =
      product.listPrice > product.price && product.price > 0
        ? `通常 ¥${product.listPrice.toLocaleString()}`
        : "";

    const favoriteButton = node.querySelector(".favorite");
    const isFavorite = favorites.includes(product.id);

    favoriteButton.classList.toggle("active", isFavorite);
    favoriteButton.textContent = isFavorite ? "♥" : "♡";

    favoriteButton.addEventListener("click", () => {
      toggleFavorite(product.id);
    });

    const detailLink = node.querySelector(".detail-link");
    detailLink.href = product.url;

    results.appendChild(node);
  });

  $("resultCount").textContent = filtered.length;
  $("favoriteCount").textContent = favorites.length;

  if (!filtered.length) {
    showMessage("条件に一致する作品がありません。");
  }
}

function toggleFavorite(id) {
  favorites = favorites.includes(id)
    ? favorites.filter((favoriteId) => favoriteId !== id)
    : [...favorites, id];

  localStorage.setItem("favorites", JSON.stringify(favorites));
  render();
}

$("searchBtn").addEventListener("click", fetchProducts);

$("keyword").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    fetchProducts();
  }
});

["genreFilter", "makerFilter", "sortFilter"].forEach((id) => {
  $(id).addEventListener("change", render);
});

document.querySelectorAll("[data-chip]").forEach((button) => {
  button.addEventListener("click", () => {
    activeChip =
      activeChip === button.dataset.chip ? "" : button.dataset.chip;

    document.querySelectorAll("[data-chip]").forEach((chip) => {
      chip.classList.toggle(
        "active",
        chip.dataset.chip === activeChip
      );
    });

    render();
  });
});

$("resetBtn").addEventListener("click", () => {
  $("keyword").value = "";
  $("genreFilter").value = "";
  $("makerFilter").value = "";
  $("sortFilter").value = "new";

  activeChip = "";

  document.querySelectorAll("[data-chip]").forEach((button) => {
    button.classList.remove("active");
  });

  fetchProducts();
});

$("favoritesBtn").addEventListener("click", () => {
  const favoriteProducts = products.filter((product) =>
    favorites.includes(product.id)
  );

  const names = favoriteProducts.map((product) => product.title);

  alert(
    names.length
      ? `お気に入り\n\n${names.join("\n")}`
      : "お気に入りはまだありません"
  );
});

$("enterBtn").addEventListener("click", () => {
  localStorage.setItem("ageConfirmed", "1");
  $("ageGate").classList.add("hidden");
});

$("leaveBtn").addEventListener("click", () => {
  location.href = "https://www.google.com/";
});

if (localStorage.getItem("ageConfirmed") === "1") {
  $("ageGate").classList.add("hidden");
}

fetchProducts();
