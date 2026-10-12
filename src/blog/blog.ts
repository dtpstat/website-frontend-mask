import { posts } from './posts.js';
import { initMobileMenu } from '../site/menu.js';

(() => {
  const text = {
    ru:{blog:'Блог и исследования',rating:'Рейтинг регионов',download:'Скачать данные',about:'О проекте',team:'Станьте частью команды',support:'Поддержать проект',allTags:'Все теги',newest:'Сначала новые',oldest:'Сначала старые',search:'Поиск',find:'Найти',raised:'Собрано: 15 546 ₽ из 50 000 ₽',days:'До конца сбора 6 дней',project:'Карта ДТП',footerCopy:'Мы собираем и показываем данные о дорожных происшествиях, чтобы улицы становились безопаснее.',contact:'Связаться:',siteMap:'Карта сайта:',license:'Использование материалов возможно с указанием активной ссылки на сайт.',reports:'Отчёты',crowdfunding:'Краудфандинг',overview:'Обзорные статьи',russian:'Российские новости «Vision zero»',vision:'Новости «Vision zero»'},
    en:{blog:'Blog & research',rating:'Regional rating',download:'Download data',about:'About the project',team:'Join the team',support:'Support the project',allTags:'All tags',newest:'Newest first',oldest:'Oldest first',search:'Search',find:'Find',raised:'Raised: ₽15,546 of ₽50,000',days:'6 days left',project:'Road crash map',footerCopy:'We collect and publish road-crash data to help make streets safer.',contact:'Contact:',siteMap:'Site map:',license:'Materials may be used with an active link to this website.',reports:'Reports',crowdfunding:'Crowdfunding',overview:'Overviews',russian:'Russian Vision Zero news',vision:'Vision Zero news'}
  };
  let lang = new URLSearchParams(location.search).get('lang') || localStorage.getItem('blog-language') || 'ru';
  let selectedTag = 'all', query = '';
  const $ = s => document.querySelector(s);
  const postArea = $('.posts'), tagFilter = $('#tag-filter'), sort = $('#sort');
  const title = p => p.title;
  const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const postUrl = p => `?post=${encodeURIComponent(p.slug)}${lang === 'en' ? '&lang=en' : ''}`;
  function renderPosts() {
    const order = [...posts].sort((a,b) => (a.date.split('.').reverse().join('')).localeCompare(b.date.split('.').reverse().join('')) * (sort.value === 'old' ? 1 : -1));
    postArea.className = 'posts';
    postArea.innerHTML = order.filter(p => (selectedTag === 'all' || p.tags.includes(selectedTag)) && title(p).toLowerCase().includes(query)).map(p => `<article class="post"><a href="${postUrl(p)}" aria-label="${escape(title(p))}"><img class="cover" src="${p.cover}" alt=""><div class="post-copy"><p>${p.tags.map(escape).join(' · ')}</p><h2>${escape(title(p))}</h2><time>${p.date}</time></div></a></article>`).join('') || `<p>${lang === 'ru' ? 'Ничего не найдено' : 'Nothing found'}</p>`;
  }
  function renderArticle(post) {
    document.title = `DTP Stat — ${post.title}`;
    postArea.className = 'article';
    postArea.innerHTML = `<a class="back" href="./${lang === 'en' ? '?lang=en' : ''}">← ${lang === 'ru' ? 'Все статьи' : 'All articles'}</a><p class="article-tags">${post.tags.map(escape).join(' · ')}</p><h1>${escape(post.title)}</h1><time>${post.date}</time><img class="article-cover" src="${post.cover}" alt=""><div class="article-text">${post.content}</div>`;
  }
  function calendar() {
    const panel = $('.calendar-panel');
    const names = lang === 'ru' ? ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] : ['Mo','Tu','We','Th','Fr','Sa','Su'];
    const days = Array.from({length:35},(_,i)=>i<2 || i>31 ? `<button class="muted" type="button">${i<2?30+i:i-31}</button>` : `<button type="button" class="${i===19?'selected':''}">${i-1}</button>`).join('');
    panel.innerHTML = `<div class="calendar-head"><button type="button" aria-label="Previous month">‹</button><strong>${lang === 'ru' ? 'Сентябрь 2026' : 'September 2026'}</strong><button type="button" aria-label="Next month">›</button></div><div class="week">${names.map(n=>`<span>${n}</span>`).join('')}</div><div class="dates">${days}</div>`;
  }
  function translate() {
    document.documentElement.lang = lang;
    document.title = `DTP Stat — ${text[lang].blog}`;
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = text[lang][el.dataset.i18n]);
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = text[lang][el.dataset.i18nPlaceholder]);
    $('.lang').textContent = lang === 'ru' ? 'EN' : 'RU';
    tagFilter.innerHTML = `<option value="all">${text[lang].allTags}</option>${[...new Set(posts.flatMap(post => post.tags))].map(tag=>`<option value="${escape(tag)}">${escape(tag)}</option>`).join('')}`;
    tagFilter.value = selectedTag;
    const post = posts.find(item => item.slug === new URLSearchParams(location.search).get('post'));
    $('.heading-row').hidden = Boolean(post); $('.search').hidden = true; $('.calendar-panel').hidden = true;
    post ? renderArticle(post) : (calendar(), renderPosts());
  }
  $('.lang').addEventListener('click', () => { lang = lang === 'ru' ? 'en' : 'ru'; localStorage.setItem('blog-language',lang); translate(); });
  tagFilter.addEventListener('change', e => { selectedTag = e.target.value; renderPosts(); });
  sort.addEventListener('change', renderPosts);
  $('.calendar-toggle').addEventListener('click', e => { const panel=$('.calendar-panel'), open=panel.hidden; panel.hidden=!open; e.currentTarget.setAttribute('aria-expanded',open); });
  $('.search-toggle').addEventListener('click', e => { const form=$('.search'), open=form.hidden; form.hidden=!open; e.currentTarget.setAttribute('aria-expanded',open); if(open) form.querySelector('input').focus(); });
  $('.search').addEventListener('submit', e => { e.preventDefault(); query=e.currentTarget.querySelector('input').value.trim().toLowerCase(); renderPosts(); });
  initMobileMenu();
  translate();
})();
