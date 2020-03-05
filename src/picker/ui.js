const el = (tag) => document.createElement(tag)

class FileDialog extends HTMLElement {
  connectedCallback() {
    // Create a shadow root
    var shadow = this.attachShadow({ mode: 'closed' })

    shadow.innerHTML = `
      <style>
        :host {
          --primary-bg: #1d1e21;
          --primary-border: rgb(24, 26, 31);
          --primary-variant-bg: #191b20;
          /* --primary-text: rgb(215, 218, 224); */
          --primary-text: #fff;
          /* --primary-variant-text: rgba(157, 165, 180, 0.6); */
          --primary-variant-text: #fff;
        }
        @media (prefers-color-scheme: -light) {
          :host {
            --primary-bg: #EEE;
            --primary-variant-bg: #e2e2e2;
            --primary-border: transparent;
          }
        }
        #backdrop {
          position: fixed;
          top: 0px;
          right: 0px;
          bottom: 0px;
          left: 0px;
          background: rgba(0, 0, 0, 0.1);
        }
        #dialog {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
          position: fixed;
          top: 0px;
          right: 0px;
          bottom: 0px;
          left: 0px;
          resize: both;
          overflow: hidden;
          display: flex;
          align-items: stretch;
          flex-direction: column;
          background: var(--primary-bg);
          color: var(--primary-variant-text);
          width: 750px;
          height: 500px;
          max-width: 100vw;
          max-height: 100vh;
          margin: 0 auto;
          box-shadow: 0 2px 14px 0 rgba(0, 0, 0, 0.5),
                      0 2px 4px 0 rgba(0, 0, 0, 0.5);
        }
        #main {
          flex: 1 1 auto;
        }
        nav {
          background-color: var(--primary-variant-bg);
          border: 1px solid var(--primary-border);
          flex: 0 1 auto;
        }
        /* #close {
          background: transparent;
          border: 0 none;
          color: #fff;
          font-size: 1.3em;
          cursor: pointer;
          position: absolute;
          right: 0;
          top: 0;
          transform: scale(0);
        } */
        /* #close:focus,
        #dialog:hover #close {
          transform: scale(1);
        } */
        header, footer {
          background: #2e2e2e;
          padding: 10px;
        }
        footer {
          border-top: 1px solid #607f96;
        }
        .fjs-container {
          display: flex;
          flex: 1;
          overflow: scroll;
        }
        .fjs-col {
          border-right: solid 1px #000;
          max-height: 600px;
          min-height: inherit;
          min-width: 200px;
          overflow-y: auto;
        }
        .fjs-col:first-child {
          background: #272828;
        }
        .fjs-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .fjs-list a {
          align-items: flex-end;
          display: flex;
          justify-content: space-between;
          padding: 5px;
          text-decoration: none;
          cursor: pointer;
        }
        .fjs-list a:after{
          content: "►";
          font-size: 0.6rem;
          margin: 7px;
        }
        .fjs-active a {
          background-color: #DEDEDE;
        }
        .fjs-col:nth-last-child(2) .fjs-active a, .fjs-col:last-child .fjs-active a {
          background-color: dodgerblue;
          color: white;
        }
      </style>
      <div id="backdrop"></div>
      <div id="dialog">
        <header>
          <!-- <button id="close" aria-label="Close file dialog">&times;</button> -->
          <select>
            <option>hmm?</option>
          </select>
          <input type="search" placeholder="Search">
        </header>
        <div class="fjs-container" tabindex="0"></div>
        <footer>
          <button>Alternetive</button>
          <button id="close">Abort</button>
          <button disabled>Open</button>
        </footer>
      </div>
    `

    this.init(shadow)
    // setTimeout(() => {
    //   let slots = shadow.querySelector('slot')
    //   // slots.assignedNodes()
    // }, 100)
  }

  init (shadow) {
    let backdrop = shadow.querySelector('#backdrop')
    let close = shadow.querySelector('#close')
    let dialog = shadow.querySelector('#dialog')
    let fsContainer = shadow.querySelector('.fjs-container')
    this.fsContainer = fsContainer
    this.tabIndex = 0
    fsContainer.focus()
    this.fsContainer
    fsContainer.onkeydown = this.onKeydown
    fsContainer.onclick = this.onClick.bind(this)
    backdrop.onclick = evt => evt.target === backdrop && this.abort()
    close.onclick = this.abort
  }

  /**
   * @param  {object} data
   * @param  {object} config
   * @param  {parent} [parent] - parent item that clicked/triggered createColumn
   */
  createColumn (data) {
    const div = el('div')
    const list = this.createList(data)
    div.appendChild(list)
    div.className = 'fjs-col'
    return div
  }

  /**
   * @param  {array} data
   * @param  {object} config
   * @return {element} list
   */
  createList (data) {
    const ul = el('ul')
    const items = data.forEach(item => {
      ul.appendChild(this.createItem(item))
    })
    ul.className = 'fjs-list'
    return ul
  }

  /**
   * @param {object} item data
   */
  createItem (item) {
    var li = el('li')
    var a = el('a')
    // var createItemContent = cfg.createItemContent || finder.createItemContent;
    // frag = createItemContent.call(null, cfg, item);
    a.innerText = '📁 ' + item.label
    li.appendChild(a)
    return li
  }

  /**
   * @param  {object} config
   * @param  {object} event value
   * @param {object | undefined}
   */
  itemSelected (item) {
    var itemEl = value.item;
    var item = itemEl._item;
    var col = value.col;
    var data = item[cfg.childKey] || cfg.data;
    var activeEls = col.getElementsByClassName(cfg.className.active);
    var x = window.pageXOffset;
    var y = window.pageYOffset;
    var newCol;

    if (activeEls.length) {
      _.removeClass(activeEls[0], cfg.className.active);
    }
    _.addClass(itemEl, cfg.className.active);
    _.nextSiblings(col).map(_.remove);

    // fix for #14: we need to keep the focus on a live DOM element, such as the
    // container, in order for keydown events to get fired
    cfg.container.focus();
    window.scrollTo(x, y);

    if (data) {
      newCol = finder.createColumn(data, cfg, item);
      cfg.emitter.emit('interior-selected', item);
    } else if (item.url) {
      document.location.href = item.url;
    } else {
      cfg.emitter.emit('leaf-selected', item);
    }
    return newCol;
  }

  /**
   * Handles keyboard navigations
   *
   * @param  {KeyboardEvent} evt
   */
  onKeydown = evt => {
    switch (evt.keyCode) {
      case 9: // tab
        // evt.preventDefault()
      break
      case 27: // esc
        this.abort()
      break
      case 32: // space
        // preview
      break
      case 37: // left
        // code
        evt.target.querySelector('.fjs-col:nth-last-child(3) .fjs-active')?.click()
      break
      case 38: // up
        evt.target.querySelector('.fjs-col:nth-last-child(2) .fjs-active').previousElementSibling?.click()
      break
        // code
      case 39: // right
        evt.target.querySelector('.fjs-col:last-child li').click()
      break
        // code
      case 40: // down
        evt.target.querySelector('.fjs-col:nth-last-child(2) .fjs-active + li')?.click()
    }
  }

  onClick (evt) {
    const { target } = evt
    const { fsContainer } = this
    const col = target.closest('.fjs-col')
    const item = target.closest('.fjs-list li')

    if (item) {
      col.querySelector('.fjs-active')?.classList.remove('fjs-active')
      item.classList.add('fjs-active')
      while (col.nextSibling) col.nextSibling.remove()
      fsContainer.appendChild(this.createColumn([
        { label: 'Application cache' },
        { label: 'Cache Storage' },
        { label: 'Sandboxed Filesytem' },
      ]))
      item.scrollIntoView({ block: 'nearest', inline: 'start' })
    }
  }

  abort = () => {
    this.reject(new DOMException('The user aborted a request.'))
    this.remove()
  }

  chooseFileSystemEntries = opts => new Promise((rs, rj) => {
    this.resolve = rs
    this.reject = rj
    this.options = opts
    this.fsContainer.appendChild(this.createColumn(opts.services))
    this.fsContainer.querySelector('li').click()
  })
}

customElements.define('file-dialog', FileDialog)
