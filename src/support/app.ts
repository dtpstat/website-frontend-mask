const translations = {
  ru: {
    title: 'Поддержать проект', button: 'Поддержать проект', raised: 'Собрано: 15\u00a0546 ₽ из 50\u00a0000 ₽', days: 'До конца сбора 6 дней', other: 'и другие', large: 'Для крупных пожертвований', largeText: 'Если хотите внести большую сумму — напишите нам в Телеграм', write: 'Написать', thanks: 'Особая благодарность крупным спонсорам', intro: '«Карта ДТП» — сайт, на котором можно получить информацию о ДТП в России в наглядном формате. Наш проект существует с 2017 года и с тех пор активно используется проектировщиками, активистами и просто неравнодушными людьми, заинтересованными в том, чтобы сделать улицы наших городов безопасней. «Карта ДТП» — некоммерческий проект, он существует только за счёт пожертвований пользователей. Все собранные деньги мы вкладываем в работу над сайтом и контентом. Сейчас мы планируем добавить «Карте ДТП» новые функции, а также хотим масштабировать проект на Казахстан и Сербию. Начиная с августа, на стабильную работу проекта нужно собирать по 50 тыс. рублей в месяц. На эти деньги мы будем оплачивать хостинг, время разработчиков, редактора и авторов, дизайнеров, модераторов. Мы будем рады любой поддержке, но особенно ценим подписку на регулярные пожертвования, пусть даже небольшие, потому что они позволяют нам планировать свою деятельность. Помните, ДТП — это не просто точки на карте или цифры в статистике. Это сломанные человеческие судьбы. Это травмы и смерти, которые можно было предотвратить.',
    nav: { blog: 'Блог и исследования', stats: 'Статистика', download: 'Скачать данные', about: 'О проекте' }, footer: { about: 'Проект посвящен проблеме дорожно-транспортных происшествий в России. Цель проекта — повышение безопасности дорожного движения и снижение смертности в ДТП.', contact: 'Связаться:', map: 'Карта сайта:', rating: 'Рейтинг регионов', join: 'Станьте частью команды', license: 'Использование материалов возможно с указанием активной ссылки на сайт.' }
  },
  en: {
    title: 'Support the project', button: 'Support the project', raised: 'Raised: ₽15,546 of ₽50,000', days: '6 days remaining', other: 'and more', large: 'For larger donations', largeText: 'For a larger donation, please message us on Telegram', write: 'Write to us', thanks: 'Special thanks to major supporters', intro: 'Crash Map is a website that presents road-crash information in a clear format. Our project has existed since 2017 and is actively used by planners, activists, and people who want to make city streets safer. Crash Map is a non-profit project supported entirely by users’ donations. We invest every contribution in the website and its content. We are planning new features and want to expand the project to Kazakhstan and Serbia. Stable work requires ₽50,000 per month for hosting, developers, editors, authors, designers, and moderators. We welcome every contribution, especially regular donations: they let us plan our work. Crashes are not merely points on a map or numbers in a chart. They are broken lives, injuries, and deaths that could have been prevented.',
    nav: { blog: 'Blog & research', stats: 'Statistics', download: 'Download data', about: 'About' }, footer: { about: 'The project focuses on road crashes in Russia. Its goal is to improve road safety and reduce deaths in road crashes.', contact: 'Contact:', map: 'Site map:', rating: 'Region ranking', join: 'Join the team', license: 'Materials may be used with an active link to this website.' }
  }
};

let language = new URLSearchParams(location.search).get('lang') || localStorage.getItem('support-language') || 'ru';
const value = key => key.split('.').reduce((object, part) => object?.[part], translations[language]) ?? translations[language][key.replace('support.', '')];
function setLanguage(next) {
  language = next;
  document.documentElement.lang = next;
  document.title = `${translations[next].title} — Crash Map`;
  document.querySelectorAll('[data-i18n]').forEach(element => { element.textContent = value(element.dataset.i18n); });
  document.querySelectorAll('[data-lang-toggle]').forEach(button => { button.textContent = next === 'ru' ? 'EN' : 'RU'; });
  localStorage.setItem('support-language', next);
}
document.querySelectorAll('[data-lang-toggle]').forEach(button => button.addEventListener('click', () => setLanguage(language === 'ru' ? 'en' : 'ru')));
document.querySelectorAll('[data-scroll-support]').forEach(button => button.addEventListener('click', () => document.querySelector('#support').scrollIntoView({ behavior: 'smooth' })));
const menu = document.querySelector('#mobile-menu');
document.querySelector('[data-menu-toggle]').addEventListener('click', event => { const open = menu.hidden; menu.hidden = !open; event.currentTarget.setAttribute('aria-expanded', String(open)); });
setLanguage(language);
