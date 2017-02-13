## Description
This widget implements the Google Timeline Chart in Mendix. An efficient way to display (and possibly edit) time related entries in your domain model. Also see https://developers.google.com/chart/interactive/docs/gallery/timeline for more information on the functionalities and limitations of the Google Timeline Chart.

##Typical usage scenario
Use this widget to render time related entries for the user. This can be handy for example when the user needs to get a quick overview of possible overlaps or otherwise conflicting data or to pinpoint when there is a timeslot available.

##Features and limitations
* Allows rendering of and interaction with time related data
* Easy configuration of the timeline using widget settings
* Can be used with persistent and non persistent entities
* Data retrieval over association is possible
* The chart is always loaded from the Google servers using the Google Loader, internet connection is required
* If you want to add custom styling, the chart is located in a div with class "google-timeline-chart", the info message in "google-timeline-info"


##Dependencies
* Build and tested using Mendix 6.10.2
