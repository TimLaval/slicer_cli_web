import _ from 'underscore';

import View from 'girder/views/View';
import { SORT_DESC } from 'girder/constants';
import eventStream from 'girder/utilities/EventStream';
import { restRequest } from 'girder/rest';

// register worker status definitions as a side effect
import 'girder_plugins/worker/JobStatus';

import JobCollection from 'girder_plugins/jobs/collections/JobCollection';
import JobStatus from 'girder_plugins/jobs/JobStatus';

import OutputParameterDialog from './OutputParameterDialog';

import jobListWidget from '../templates/jobsListWidget.pug';

// cache parameter file models
const paramFiles = {};

const JobsListWidget = View.extend({
    events: {
        'click .s-param-file': '_clickParamFile'
    },

    initialize() {
        if (!this.collection) {
            this.collection = new JobCollection();

            // We want to display 10 jobs, but we are filtering
            // them on the client, so we fetch extra jobs here.
            // Ideally, we would be able to filter them server side
            // but the /job endpoint doesn't currently have the
            // flexibility to do so.
            this.collection.pageLimit = 50;
            this.collection.sortDir = SORT_DESC;
            this.collection.sortField = 'created';
        }

        this.listenTo(this.collection, 'all', this.render);
        this.listenTo(eventStream, 'g:event.job_status', this.fetchAndRender);
        this.listenTo(eventStream, 'g:event.job_created', this.fetchAndRender);
        this.fetchAndRender();
    },

    render() {
        const jobs = this.collection.filter((job, index) => {
            return index < 10 && job.get('title').match(/HistomicsTK\./);
        }).map((job) => {
            // make an async request to add output parameter information
            // to the job model
            this._paramFile(job);
            return _.extend({paramFile: paramFiles[job.id]}, job.attributes);
        });

        this.$el.html(jobListWidget({
            jobs,
            JobStatus
        }));
        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});
        return this;
    },

    fetchAndRender() {
        this.collection.fetch(null, true)
            .then(() => this.render());
    },

    _paramFile(job) {
        // we already processed this job
        if (_.has(paramFiles, job.id)) {
            return;
        }

        const bindings = job.get('slicerCLIBindings') || {};
        const outputs = bindings.outputs || {};
        const id = outputs.parameters;

        if (id) {
            // avoid processing this job again
            paramFiles[job.id] = {};

            // check if the file still exists
            restRequest({
                path: `file/${id}`,
                error: null
            }).done((file) => {
                paramFiles[job.id] = file;
                this.render();
            });
        }
    },

    _clickParamFile(evt) {
        const fileId = $(evt.currentTarget).data('file-id');
        restRequest({
            path: `file/${fileId}/download`,
            dataType: 'text'
        }).done((parameters) => {
            const view = new OutputParameterDialog({
                parentView: this,
                el: '#g-dialog-container',
                parameters
            });
            view.render();
        });
    }
});

export default JobsListWidget;
