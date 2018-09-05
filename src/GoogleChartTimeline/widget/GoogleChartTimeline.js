/*global logger*/
/*
    GoogleChartTimeline
    ========================

    @file      : GoogleChartTimeline.js
    @version   : 1.2.0
    @author    : Jelle Dekker
    @date      : 2018/02/22
    @copyright : Bizzomate 2018
    @license   : Apache 2

    Documentation
    ========================
    This widget implements the Google Timeline Chart in Mendix.
*/

// Required module list. Remove unnecessary modules, you can always get them back from the boilerplate.
define([
  "dojo/_base/declare",
  "mxui/widget/_WidgetBase",
  "dijit/_TemplatedMixin",

  "mxui/dom",
  "dojo/dom",
  "dojo/dom-style",
  "dojo/dom-construct",
  "dojo/_base/array",
  "dojo/_base/lang",
  "dojo/html",

  "dojo/query",

  "GoogleChartTimeline/lib/loader",
  "dojo/text!GoogleChartTimeline/widget/template/GoogleChartTimeline.html"
], function (declare, _WidgetBase, _TemplatedMixin, dom, dojoDom, dojoStyle, dojoConstruct, dojoArray, dojoLang, dojoHtml, dojoQuery, loader, widgetTemplate) {
  "use strict";

  // Declare widget's prototype.
  return declare("GoogleChartTimeline.widget.GoogleChartTimeline", [_WidgetBase, _TemplatedMixin], {
    // _TemplatedMixin will create our dom node using this HTML template.
    templateString: widgetTemplate,

    // DOM elements
    chartNode: null,
    infoNode: null,

    // Parameters configured in the Modeler.
    dataItem: "",
    rowLabel: "",
    missingRowLabel: "",
    barLabel: "",
    tooltip: "",
    barStart: "",
    barEnd: "",
    dataRetrieveMF: "",

    noResultsMessage: "",
    maxHeight: "",
    barColor: "",
    backgroundColor: "",
    showTooltips: "",
    colorByRowLabel: "",
    groupByRowLabel: "",
    showRowLabels: "",
    showBarLabels: "",
    showProgressbar: "",

    onSelectMF: "",

    chartVersion: "",
    chartLanguage: "",

    // Internal variables. Non-primitives created in the prototype are shared between all widget instances.
    _handles: null,
    _contextObj: null,
    _alertDiv: null,
    _readOnly: false,
    _dataTable: null,
    _options: null,
    _chart: null,
    _rowItems: null,
    _itemsLoaded: null,
    _progressDialogId: null,

    // dojo.declare.constructor is called to construct the widget instance. Implement to initialize non-primitive properties.
    constructor: function () {
      //logger.level(logger.DEBUG);
      logger.debug(this.id + ".constructor");
      this._handles = [];
    },

    // dijit._WidgetBase.postCreate is called after constructing the widget. Implement to do extra setup work.
    postCreate: function () {
      logger.debug(this.id + ".postCreate");

      if (this.readOnly || this.get("disabled") || this.readonly) {
        this._readOnly = true;
      }

      this._updateRendering();
    },

    // mxui.widget._WidgetBase.update is called when context is changed or initialized. Implement to re-render and / or fetch data.
    update: function (obj, callback) {
      logger.debug(this.id + ".update");

      this._contextObj = obj;
      this._resetSubscriptions();
      this._updateRendering(callback); // We're passing the callback to updateRendering to be called after DOM-manipulation
    },

    // mxui.widget._WidgetBase.enable is called when the widget should enable editing. Implement to enable editing if widget is input widget.
    enable: function () {
      logger.debug(this.id + ".enable");
    },

    // mxui.widget._WidgetBase.enable is called when the widget should disable editing. Implement to disable editing if widget is input widget.
    disable: function () {
      logger.debug(this.id + ".disable");
    },

    // mxui.widget._WidgetBase.resize is called when the page's layout is recalculated. Implement to do sizing calculations. Prefer using CSS instead.
    resize: function (box) {
      logger.debug(this.id + ".resize");
      if (this._chart) {
        this._drawChartOrShowMessage();
      }
    },

    // mxui.widget._WidgetBase.uninitialize is called when the widget is destroyed. Implement to do special tear-down work.
    uninitialize: function () {
      logger.debug(this.id + ".uninitialize");
      // Clean up listeners, helper objects, etc. There is no need to remove listeners added with this.connect / this.subscribe / this.own.
      this._unsubscribe();
    },

    // Rerender the interface.
    _updateRendering: function (callback) {
      logger.debug(this.id + "._updateRendering");

      if (this._contextObj) {
        dojoStyle.set(this.domNode, "display", "block");
        dojoStyle.set(this.chartNode, "height", this.maxHeight + 'px');

        if (!google.visualization || !google.visualization.Timeline) {
          this._loadGoogleTimelineChart();
        } else {
          this._getChartData();
        }
      } else {
        dojoStyle.set(this.domNode, "display", "none");
      }

      // The callback, coming from update, needs to be executed, to let the page know it finished rendering
      this._executeCallback(callback, '_updateRendering');
    },

    //Use the Google Loader script to get the provided version of the Google Timeline chart
    _loadGoogleTimelineChart: function () {
      logger.debug(this.id + "._loadGoogleTimelineChart");
      google.charts.load(this.chartVersion, {
        packages: ["timeline"],
        language: this.chartLanguage
      });
      google.charts.setOnLoadCallback(dojoLang.hitch(this, function () {
        this._setChartOptions();
        this._getChartData();
      }));
    },

    //Set the charts options based on the widget config in the Mx Modeler
    _setChartOptions: function () {
      logger.debug(this.id + "._setChartOptions");
      this._options = {
        timeline: {
          colorByRowLabel: this.colorByRowLabel,
          groupByRowLabel: this.groupByRowLabel,
          showRowLabels: this.showRowLabels,
          showBarLabels: this.showBarLabels,
          singleColor: (this.barColor && this.barColor.trim().length ? this.barColor : null)
        },
        tooltip: {
          trigger: (this.showTooltips == true ? 'focus' : 'none')
        },
        backgroundColor: (this.backgroundColor && this.backgroundColor.trim().length ? this.backgroundColor : null)
      };
    },

    //Execute the provided microflow in Mendix to get the display data
    _getChartData: function () {
      logger.debug(this.id + "._getChartData");
      if (this.showProgressbar) {
        this._showProgress();
      }
      mx.data.action({
        params: {
          applyto: "selection",
          actionname: this.dataRetrieveMF,
          guids: [this._contextObj.getGuid()]
        },
        store: {
          caller: this.mxform
        },
        callback: dojoLang.hitch(this, this._buildDataTable),
        error: dojoLang.hitch(this, function (error) {
          try {
            // In try catch because we have no idea why it failed.
            this._hideProgress();
          } catch (error) {
            // ignore.            
          }
          console.log(this.id + '_getChartData ' + error);
        })
      });
    },

    //Enter the data into the Google Chart format
    _buildDataTable: function (itemList) {
      logger.debug(this.id + "._buildDataTable");
      var
        customTooltip = this.tooltip && this.tooltip.trim().length,
        totalRows = itemList.length,
        totalToLoad = (customTooltip ? totalRows * 5 : totalRows * 4);

      if (!this._dataTable) {
        this._dataTable = new google.visualization.DataTable();

        this._dataTable.addColumn({
          type: 'string',
          id: 'rowLabel'
        });
        this._dataTable.addColumn({
          type: 'string',
          id: 'barLabel'
        });
        //Add the optional tooltip if it was defined
        if (customTooltip) {
          this._dataTable.addColumn({
            type: 'string',
            role: 'tooltip',
            p: {
              html: true
            }
          });
        }
        this._dataTable.addColumn({
          type: 'date',
          id: 'Start'
        });
        this._dataTable.addColumn({
          type: 'date',
          id: 'End'
        });
      } else {
        this._dataTable.removeRows(0, this._dataTable.getNumberOfRows());
      }
      this._dataTable.addRows(totalRows);
      this._rowItems = [];
      this._itemsLoaded = 0;

      if (itemList.length) {
        dojoArray.forEach(itemList, dojoLang.hitch(this, function (item, i) {
          var row = [];
          this._rowItems[i] = item.getGuid();

          item.fetch(this.rowLabel, dojoLang.hitch(this, function (value) {
            this._dataTable.setValue(i, 0, value && value.length ? value : this.missingRowLabel);
            this._chartDataLoaded(totalToLoad);
          }));
          item.fetch(this.barLabel, dojoLang.hitch(this, function (value) {
            this._dataTable.setValue(i, 1, value && value.length ? value : "");
            this._chartDataLoaded(totalToLoad);
          }));
          //Add the optional tooltip if it was defined
          if (customTooltip) {
            item.fetch(this.tooltip, dojoLang.hitch(this, function (value) {
              this._dataTable.setValue(i, 2, value && value.length ? value : "");
              this._chartDataLoaded(totalToLoad);
            }));
          }
          item.fetch(this.barStart, dojoLang.hitch(this, function (value) {
            this._dataTable.setValue(i, (customTooltip ? 3 : 2), new Date(value));
            this._chartDataLoaded(totalToLoad);
          }));
          item.fetch(this.barEnd, dojoLang.hitch(this, function (value) {
            this._dataTable.setValue(i, (customTooltip ? 4 : 3), new Date(value));
            this._chartDataLoaded(totalToLoad);
          }));
        }));
      } else {
        this._drawChartOrShowMessage();
      }
      this._hideProgress();
    },

    //Check if all the data has been loaded
    _chartDataLoaded: function (totalToLoad) {
      logger.debug(this.id + "._chartDataLoaded");
      this._itemsLoaded = this._itemsLoaded + 1;
      if (this._itemsLoaded === totalToLoad) {
        this._drawChart();
      }
    },

    //Handle user interaction (Click on bar)
    _selectHandler: function () {
      logger.debug(this.id + "._selectHandler");
      var selectedDataItem = this._chart.getSelection()[0];
      if (selectedDataItem) {
        mx.data.action({
          params: {
            applyto: "selection",
            actionname: this.onSelectMF,
            guids: [this._rowItems[selectedDataItem.row]]
          },
          store: {
            caller: this.mxform
          },
          error: dojoLang.hitch(this, function (error) {
            console.log(this.id + '_selectHandler ' + error);
          })
        });
      }
    },

    //Check if we can draw the chart
    _drawChartOrShowMessage: function () {
      logger.debug(this.id + "._drawChartOrShowMessage");

      if (this._dataTable && this._dataTable.getNumberOfRows()) {
        this._drawChart();
      } else {
        this._showNoResultsMessage();
      }
    },

    //Draw the chart on screen
    _drawChart: function () {
      logger.debug(this.id + "._drawChart");

      dojoStyle.set(this.chartNode, "display", "block");
      dojoStyle.set(this.infoNode, "display", "none");

      if (this._chart) {
        this._chart.clearChart();
        dojoStyle.set(this.chartNode, "height", this.maxHeight + 'px');
      } else {
        this._chart = new google.visualization.Timeline(this.chartNode);
        if (this.onSelectMF && this.onSelectMF.trim().length) {
          google.visualization.events.addListener(this._chart, 'select', dojoLang.hitch(this, this._selectHandler));
        }
        google.visualization.events.addListener(this._chart, 'ready', dojoLang.hitch(this, this._setGraphHeight));
      }
      this._setChartOptions();
      this._chart.draw(this._dataTable, this._options);
    },

    //Show the message that no results are found
    _showNoResultsMessage: function () {
      logger.debug(this.id + "._showNoResultsMessage");

      dojoStyle.set(this.chartNode, "display", "none");
      dojoStyle.set(this.infoNode, "display", "block");

      dojoHtml.set(this.infoNode, this.noResultsMessage);
    },

    //Adjust the height of the container to implement max-height
    _setGraphHeight: function () {
      var
        div = dojoQuery('div div', this.chartNode)[0],
        svg = dojoQuery('svg', this.chartNode),
        g1 = dojoQuery('g', svg[0])[0],
        g2 = (svg.length == 1 ? dojoQuery('g', svg[0])[1] : dojoQuery('g', svg[1])[0]),
        graphHeight = g1.getBBox().height + g2.getBBox().height + 25;

      if (dojoStyle.get(this.chartNode, 'height') == 0) {
        return;
      }

      if (graphHeight < dojoStyle.get(this.chartNode, 'height')) {
        svg[0].setAttribute('height', graphHeight);
        if (svg[1]) {
          svg[1].setAttribute('height', graphHeight);
        }
        dojoStyle.set(div, 'height', graphHeight + 'px');
        dojoStyle.set(this.chartNode, 'height', graphHeight + 'px');
      }
    },

    _unsubscribe: function () {
      if (this._handles) {
        dojoArray.forEach(this._handles, function (handle) {
          mx.data.unsubscribe(handle);
        });
        this._handles = [];
      }
    },

    // Reset subscriptions.
    _resetSubscriptions: function () {
      logger.debug(this.id + "._resetSubscriptions");
      // Release handles on previous object, if any.
      this._unsubscribe();

      // When a mendix object exists create subscribtions.
      if (this._contextObj) {
        var objectHandle = mx.data.subscribe({
          guid: this._contextObj.getGuid(),
          callback: dojoLang.hitch(this, function (guid) {
            this._updateRendering();
          })
        });

        this._handles = [objectHandle];
      }
    },

    // Show progressbar, only when not already active.
    _showProgress: function () {
      if (this._progressDialogId === null) {
        this._progressDialogId = mx.ui.showProgress();
      }
    },

    // Hide progressbar, if visible
    _hideProgress: function () {
      if (this._progressDialogId !== null) {
        mx.ui.hideProgress(this._progressDialogId);
        this._progressDialogId = null;
      }
    },

    _executeCallback: function (cb, from) {
      logger.debug(this.id + "._executeCallback" + (from ? " from " + from : ""));
      if (cb && typeof cb === "function") {
        cb();
      }
    }
  });
});

require(["GoogleChartTimeline/widget/GoogleChartTimeline"]);
