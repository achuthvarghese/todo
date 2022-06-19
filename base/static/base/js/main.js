// Main JS

function markCancel(task_id) {
    console.log(`Cancel ${task_id}`)
}

function markDone(task_id) {
    console.log(`Done ${task_id}`)
}

function showDetails(task_id) {
    $('.task-details').hide('slow')
    $(`#${task_id} .task-details`).toggle('slow')
}