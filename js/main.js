/* global jQuery, BWIPP, BWIPJS, Bitmap, Module */
/* global BarcOwned, addBtnGrpValFunction */

const barcOwned = new BarcOwned()

jQuery(($) => {
  const setupScripts = []
  const payloadScripts = []

  let barcodes = []

  // UI references
  const barcodeScannerSelect = $('#barcodeScannerSelect')
  const payloadScriptSelect = $('#payloadScriptSelect')
  const runDelaySelect = $('#runDelaySelect')
  const displayModeSelect = $('#displayModeSelect')
  const runModeSelect = $('#runModeSelect')
  const updateRateSelect = $('#updateRateSelect')
  const setupScriptsList = $('#setupScriptsList')
  const selectedScriptHasDupesSelect = $('#selectedScriptHasDupes')
  const quietPeriodDelaySelect = $('#quietPeriodDelaySelect')

  const internalLinkContainers = $('.internal-links')

  const configUI = $('section.setup')
  const runUI = $('section.run')
  const stopButton = $('#stopButton')

  const barcodeCanvas = $('#barcodeCanvas')

  /* /////////////////////////////////////////////////// */
  //             Button selection functions              //
  /* /////////////////////////////////////////////////// */

  const buttonGroups = [displayModeSelect, runModeSelect]
  addBtnGrpValFunction(buttonGroups)

  /* /////////////////////////////////////////////////// */
  //           Config Section Initialization             //
  /* /////////////////////////////////////////////////// */

  // Populate scanner models
  barcOwned.models.forEach((model) => {
    barcodeScannerSelect.append(`<option>${model.name}</option>`)
  })

  populateSetupScripts(() => {
    populatePayloadScripts()
  })

  /* /////////////////////////////////////////////////// */
  //                   Event handlers                    //
  /* /////////////////////////////////////////////////// */

  internalLinkContainers.find('a').each((idx, link) => {
    const $link = $(link)

    $link.on('click', (event) => {
      event.preventDefault()

      const href = $link.attr('href')

      if (href === '#config') {
        configUI.show()
        runUI.hide()
        stop()
      } else if (href === '#run') {
        configUI.hide()
        runUI.show()
        run()
      }

      updateInternalLinkStates(href)
    })
  })

  function updateInternalLinkStates (href) {
    const activeClass = 'active'

    internalLinkContainers.find('li').removeClass(activeClass)

    internalLinkContainers.find(`a[href="${href}"]`).each((idx, link) => {
      $(link).parent().addClass(activeClass)
    })
  }

  payloadScriptSelect.on('change', (event) => {
    populateBarcodes()
    populateScriptDupesSelect()
    populateSetupScriptList()
  })

  function populateScriptDupesSelect () {
    const dupesExist = barcodesHaveAdjacentDuplicates(barcodes)

    selectedScriptHasDupesSelect.html('')
    selectedScriptHasDupesSelect.append(`<option selected>${dupesExist ? 1 : 0}</option>`).trigger('change')
  }

  function populateSetupScriptList () {
    const payloadScript = getPayloadScript({ name: payloadScriptSelect.val() })

    setupScriptsList.html('')

    if (payloadScript['setup-dependencies']) {
      payloadScript['setup-dependencies'].forEach((dependency) => {
        const dependencyName = dependency.endsWith('.json') ? dependency : dependency.concat('.json')
        const setupScript = getSetupScript({ scriptName: dependencyName })

        setupScriptsList.append(`<li class="list-group-item"><span>${setupScript.name}</span></li>`)
      })
    } else {
      setupScriptsList.append(`<li class="list-group-item"><span>No setup scripts will be run</span></li>`)
    }
  }

  /* /////////////////////////////////////////////////// */
  //                   Core Functions                    //
  /* /////////////////////////////////////////////////// */

  function populateBarcodes () {
    const model = barcOwned.getModelByName(barcodeScannerSelect.val())
    const runMode = runModeSelect.val()

    const payloadScript = Object.assign({ type: 'payload' }, getPayloadScript({ name: payloadScriptSelect.val() }))
    const setupScripts = []

    barcodes = []

    payloadScript['setup-dependencies'] && payloadScript['setup-dependencies'].forEach((dependency) => {
      const dependencyName = dependency.endsWith('.json') ? dependency : dependency.concat('.json')

      setupScripts.push(Object.assign({ type: 'setup' }, getSetupScript({ scriptName: dependencyName })))
    })

    if (runMode === 'Setup Only' || runMode === 'Setup + Payload') {
      setupScripts.forEach((setupScript) => {
        importBarcodeData(barcOwned.getBarcodeData(setupScript, model))
      })
    }

    if (runMode === 'Payload Only' || runMode === 'Setup + Payload') {
      importBarcodeData(barcOwned.getBarcodeData(payloadScript, model))
    }

    function importBarcodeData (barcodeData) {
      barcodeData.barcodes.forEach((barcode) => {
        barcodes.push({
          code: barcode,
          symbology: barcodeData.symbology,
          BWIPPoptions: barcodeData.BWIPPoptions
        })
      })
    }
  }

  function run () {
    const displayMode = displayModeSelect.val()
    const runDelay = displayMode === 'Auto' ? parseInt(runDelaySelect.val()) * 1000 : 0

    stop()
    stopButton.removeAttr('disabled')

    populateBarcodes()

    displayMode === 'Auto' ? barcodeCanvas.show() : barcodeCanvas.hide()
    setTimeout(() => displayBarcodes(displayMode), runDelay)
  }

  function stop () {
    stopButton.attr('disabled', true)
    clearAutoBarcodeDisplay()
    $('.barcodes-list').remove()
  }

  function clearAutoBarcodeDisplay () {
    const canvas = barcodeCanvas.get(0)
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function displayBarcodes (displayMode) {
    if (displayMode === 'Auto') {
      displayBarcodesAuto()
    } else if (displayMode === 'List') {
      displayBarcodesList()
    } else {
      throw new Error(`Unknown barcode display mode: ${displayMode}`)
    }
  }

  function displayBarcodesAuto () {
    const quietPeriodDelay = quietPeriodDelaySelect.val()
    let currentBarcodeIdx = 0

    function rotateBarcode () {
      if (!barcodes || barcodes.length === 0) {
        return
      } else if (currentBarcodeIdx >= barcodes.length) {
        stop()
        return
      }

      const barcode = barcodes[currentBarcodeIdx]
      const hasNextBarcode = currentBarcodeIdx < barcodes.length - 1
      const nextBarcode = hasNextBarcode ? barcodes[currentBarcodeIdx + 1] : null
      const rotationSpeedHz = updateRateSelect.val()
      const rotationDelay = parseInt(1000 / rotationSpeedHz)

      currentBarcodeIdx++
      drawBarcode(barcode, barcodeCanvas)

      if (hasNextBarcode && nextBarcode.code === barcode.code) {
        setTimeout(clearAutoBarcodeDisplay, rotationDelay)
        setTimeout(rotateBarcode, rotationDelay + parseInt(quietPeriodDelay * 1000))
      } else {
        setTimeout(rotateBarcode, rotationDelay)
      }
    }

    rotateBarcode()
  }

  function displayBarcodesList () {
    const displayContainer = barcodeCanvas.parent()
    displayContainer.prepend('<ol class="barcodes-list"></ol>')

    barcodes.forEach((barcode) => {
      const canvas = $('<li><canvas class="barcode"></canvas></li>')
      displayContainer.find('.barcodes-list').append(canvas)
      drawBarcode(barcode, canvas.find('canvas'))
    })
  }

  function drawBarcode (barcode, jCanvas) {
    const canvas = jCanvas.get(0)
    const ctx = canvas.getContext('2d')
    const barcodeWriter = new BWIPJS(Module, true)
    const stringBWIPPoptions = barcOwned.getBWIPPoptionStringFromObject(barcode.BWIPPoptions)

    const visViewportHeight = getVisibleViewportHeight()
    const navbarHeight = $('.navbar').outerHeight()
    const runControlsHeight = $('.run .controls').outerHeight()
    const verticalSafeMargin = 150
    const displayWidth = $('.display').width()
    const displayHeight = (visViewportHeight - navbarHeight - runControlsHeight - verticalSafeMargin)

    if (barcode.symbology === 'qrcode') {
      // QR Code
      const displaySize = Math.min(displayWidth / 42, displayHeight / 42)
      barcodeWriter.scale(displaySize, displaySize)
    } else if (barcode.symbology === 'azteccode') {
      // Aztec Code
      const displaySize = Math.min(displayWidth / 38, displayHeight / 38)
      barcodeWriter.scale(displaySize, displaySize)
    } else if (barcode.symbology === 'code128') {
      // Code 128
      barcodeWriter.scale(displayWidth / 156, 2)
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    barcodeWriter.bitmap(new Bitmap())
    BWIPP()(barcodeWriter, barcode.symbology, barcode.code, stringBWIPPoptions)
    barcodeWriter.bitmap().show(canvas, 'N') // "normal"
  }

  /* /////////////////////////////////////////////////// */
  //               Script Manifest Loaders               //
  /* /////////////////////////////////////////////////// */

  function populateSetupScripts (cb) {
    const basePath = 'scanner-setup-scripts'
    getScriptsManifest(basePath, (manifest) => {
      manifest.forEach((scriptName) => {
        getScript(basePath, scriptName, (data) => {
          data.scriptName = scriptName
          setupScripts.push(data)
        })

        // All setup scripts have been loaded
        if (manifest.slice(-1)[0] === scriptName) {
          if (typeof cb !== 'undefined') {
            cb()
          }
        }
      })
    })
  }

  function populatePayloadScripts () {
    const basePath = 'scanner-payloads'
    getScriptsManifest(basePath, (manifest) => {
      manifest.forEach((scriptName) => {
        getScript(basePath, scriptName, (data) => {
          data.scriptName = scriptName
          payloadScripts.push(data)
          loadPayload(getPayloadScript({ scriptName }))
        })
      })

      // Verify payload dependencies, and add to UI
      function loadPayload (script) {
        let dependenciesMet = true

        script['setup-dependencies'] && script['setup-dependencies'].forEach((dependency) => {
          const dependencyName = dependency.endsWith('.json') ? dependency : dependency.concat('.json')

          if (!getSetupScript({ scriptName: dependencyName })) {
            dependenciesMet = false
          }
        })

        if (dependenciesMet) {
          payloadScriptSelect.append(`<option>${script.name}</option>`)
          populateBarcodes()
          populateScriptDupesSelect()
          populateSetupScriptList()
        } else {
          console.warn(`Setup dependencies for payload ${script.name} couldn't be loaded, payload will be unavailable to run`)
        }
      }
    })
  }

  function getScriptsManifest (basePath, cb) {
    function dataHandler (data) {
      cb(data)
    }

    $.ajax({
      url: `${basePath}/manifest.json`,
      dataType: 'json'
    })
      .done((data) => {
        dataHandler(data)
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        console.info('Custom manifest not found, falling back to default')

        $.ajax({
          url: `${basePath}/manifest.example.json`,
          dataType: 'json'
        })
          .done((data) => { dataHandler(data) })
          .fail((jqXHR, textStatus, errorThrown) => {
            throw new Error(errorThrown)
          })
      })
  }

  function getScript (basePath, scriptName, cb) {
    function dataHandler (data) {
      cb(data)
    }

    $.ajax({
      url: `${basePath}/${scriptName}`,
      dataType: 'json'
    })
      .done((data) => {
        dataHandler(data)
      })
      .fail((jqXHR, textStatus, errorThrown) => {
        throw new Error(`Failed to load script ${scriptName} \n ${errorThrown.message}`)
      })
  }

  function getSetupScript (filter, scriptName) {
    return setupScripts.filter((script) => {
      let match = true

      Object.getOwnPropertyNames(filter).forEach((filterCondition) => {
        if (script[filterCondition] !== filter[filterCondition]) {
          match = false
        }
      })

      return match
    })[0]
  }

  function getPayloadScript (filter, scriptName) {
    return payloadScripts.filter((script) => {
      let match = true

      Object.getOwnPropertyNames(filter).forEach((filterCondition) => {
        if (script[filterCondition] !== filter[filterCondition]) {
          match = false
        }
      })

      return match
    })[0]
  }

  function barcodesHaveAdjacentDuplicates (barcodes) {
    let previousBarcode
    let dupesExist = false

    barcodes.forEach((barcode) => {
      if (previousBarcode && previousBarcode.code === barcode.code) {
        dupesExist = true
      }

      previousBarcode = barcode
    })
    return dupesExist
  }

  function getVisibleViewportHeight () {
    const $el = $('html')
    const scrollTop = $(this).scrollTop()
    const scrollBot = scrollTop + $(this).height()
    const elTop = $el.offset().top
    const elBottom = elTop + $el.outerHeight()
    const visibleTop = elTop < scrollTop ? scrollTop : elTop
    const visibleBottom = elBottom > scrollBot ? scrollBot : elBottom

    return (visibleBottom - visibleTop)
  }
})
