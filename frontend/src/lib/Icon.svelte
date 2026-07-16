<script>
  export let name = '';
  export let size = 18;
  export let active = false;

  const icons = {
    chat: 'M4 4h16v12H7.5L4 18.5V4z',
    dashboard: 'M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 4h8v4h-8z',
    leads: 'M4 4h16v4H4zm0 6h16v4H4zm0 6h10v4H4z',
    scraping: 'M5 4h14v2H5zM5 10h14v2H5zM5 16h14v2H5zM12 8l4 4-4 4',
    crmkanban: 'M3 3h6v8H3zm8 0h6v8h-6zM3 13h6v8H3zm8 0h6v8h-6z',
    crmtable: 'M3 3h18v4H3zm0 6h18v4H3zm0 6h18v4H3z',
    crmstats: 'M3 20V4h3v16zm6 0V9h3v11zm6 0v-8h3v8z',
    addkey: 'M12 4a4 4 0 014 4v2h2v10H6V10h2V8a4 4 0 014-4zm0 2a2 2 0 00-2 2v2h4V8a2 2 0 00-2-2z',
    shells: 'M4 4l4 4-4 4m8-8l4 4-4 4m-4 8l4-4 4 4',
    storage: 'M3 4h18v4H3zm0 6h18v10H3z',
    logs: 'M3 4h18v2H3zm0 4h18v2H3zm0 4h18v2H3zm0 4h14v2H3z',
    settings: 'M12 2l1.5 3.2a7 7 0 012.7 1.1L19.5 5l.5 4.5a7 7 0 01-1 3l2.8 2.2-3.2 3.2a7 7 0 01-3 1L15 22h-4l-.5-3.2a7 7 0 01-2.7-1L6.5 19 6 14.5a7 7 0 011-3L4.2 9.3l3.2-3.2a7 7 0 013-1L10 2z',
    openpencil: 'M3 17l5-5L3 7V3h4l5 5 5-5h4v4l-5 5 5 5v4h-4l-5-5-5 5H3v-4z',
    content: 'M4 4h16v16H4z',
    outreach: 'M3 3l18 9L3 21v-5l12-7L3 8z',
    autoconfig: 'M12 2a10 10 0 110 20 10 10 0 010-20zm0 3a7 7 0 100 14 7 7 0 000-14zm-2 4h4v2h-4zm0 3h4v4h-4z',
    codegraf: 'M3 3h8v8H3zm0 10h8v8H3zM13 3h8v8h-8zm0 10h4v8h-4zm6 0h2v8h-2z',
    key: 'M12 4a4 4 0 014 4v2h2v10H6V10h2V8a4 4 0 014-4zm0 2a2 2 0 00-2 2v2h4V8a2 2 0 00-2-2z',
    plus: 'M12 4v16M4 12h16',
    search: 'M10 3a7 7 0 014.5 12.2L21 21l-2 2-6.5-6.5A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z',
    api: 'M7 7h10v2l-3 3v5h-4v-5L7 9V7zm5 2a1 1 0 100-2 1 1 0 000 2z',
    globe: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-1 2.1v2.9h2V4.1zM4.1 11h2.9V9H4.1zm10 0h2.9V9h-2.9zm-10 2h2.9v2H4.1zm7 3.9V12h-2v4.9zM12 20a8 8 0 008-8h-2a6 6 0 01-6 6z',
    builderbot: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 4h2v5h-2V6zm0 7h2v2h-2v-2zm-4-3h2v2H7v-2zm10 0h2v2h-2v-2z',
    agency: 'M3 3h8v8H3zm0 10h8v8H3zM13 3h8v8h-8zm0 10h4v4h-4zm6-2h2v10h-2z',
    n8n: 'M4 4l4 4-4 4m4-8l4 4-4 4m8-8l-4 4 4 4',
    calcom: 'M12 2a10 10 0 110 20 10 10 0 010-20zm-2 5v6l5 3 1-2-4-2V7z',
    obscura: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3a7 7 0 110 14 7 7 0 010-14zm-3 4l5 3-5 3V9z',
    obsidian: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 4h2v6h-2V6zm0 8h2v2h-2v-2z',
  };
  $: path = icons[name] || icons.dashboard;
  $: scale = size / 24;
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke={active ? 'var(--accent)' : 'currentColor'}
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  xmlns="http://www.w3.org/2000/svg"
>
  <path d={path} />
</svg>
