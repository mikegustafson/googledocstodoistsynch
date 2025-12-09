/**
 * Google Docs <-> Todoist Two-Way Sync
 * 
 * 1. Finds comments in Google Docs assigned to you -> Creates Todoist Tasks.
 * 2. Finds completed Todoist tasks (created by this script) -> Resolves Google Doc comments.
 * 
 * SETUP:
 * 1. File > Project Properties > Script Properties: Add 'TODOIST_API_TOKEN'.
 * 2. Services > Add Service > Drive API (v3).
 */

// Configuration
var SEARCH_HOURS = 24; // Look for files modified in the last 24 hours
var SYNC_TAG_PREFIX = "[DocsSync:"; // Metadata tag for Todoist description

function syncDocsToTodoist() {
  var userEmail = Session.getActiveUser().getEmail();
  var secondaryEmail = getSecondaryEmail();
  Logger.log('Running sync for user: ' + userEmail + (secondaryEmail ? ' and ' + secondaryEmail : ''));

  // Part 1: Docs Comments -> Todoist
  syncAssignedComments(userEmail, secondaryEmail);
  
  // Part 3: Docs Assigned Tasks -> Todoist
  syncAssignedTasks(userEmail, secondaryEmail);

  // Part 2: Todoist -> Docs (Completions)
  checkTodoistCompletions();
}

// ... existing code ...

function checkAndResolveComment(item) {
  var props = PropertiesService.getUserProperties();
  
  // Check for Comment Mapping
  var commentMapping = props.getProperty('map_task_' + item.task_id);
  if (commentMapping) {
      var parts = commentMapping.split(':');
      var fileId = parts[0];
      var commentId = parts[1];
      if (fileId && commentId) {
          Logger.log('Resolving comment ' + commentId + ' for task ' + item.task_id);
          resolveGoogleDocComment(fileId, commentId);
          props.deleteProperty('map_task_' + item.task_id);
      }
      return;
  }
  
  // Check for Google Task Mapping
  var gTaskMapping = props.getProperty('map_todoist_gtask_' + item.task_id);
  if (gTaskMapping) {
       Logger.log('Resolving Google Task ' + gTaskMapping + ' for task ' + item.task_id);
       resolveGoogleTask(gTaskMapping);
       props.deleteProperty('map_todoist_gtask_' + item.task_id);
  }
}



// ==========================================
// Part 1: Docs -> Todoist
// ==========================================

function syncAssignedComments(userEmail, secondaryEmail) {
  var cutoffDate = new Date();
  cutoffDate.setHours(cutoffDate.getHours() - SEARCH_HOURS);
  
  // Use UTC format without milliseconds.
  var cutoffString = cutoffDate.toISOString().replace(/\.\d+/, "");
  
  // Query for Drive API v3
  // WIDEN SEARCH: Remove mimeType restriction to see if we are missing non-Google formats (e.g. Word, etc).
  var query = "modifiedTime > '" + cutoffString + "' and trashed = false";
  Logger.log("Drive Query: " + query);
  
  var pageToken;
  do {
    // Drive API v3 - Support Shared Drives
    var result = Drive.Files.list({
      q: query,
      pageSize: 100,
      pageToken: pageToken,
      supportsAllDrives: true, // Needed for Shared Drives
      includeItemsFromAllDrives: true, // Needed to actually return them
      fields: 'nextPageToken, files(id, name, webViewLink, mimeType)'
    });
    
    if (result.files && result.files.length > 0) {
      Logger.log('Found ' + result.files.length + ' modified files in this page.');
      for (var i = 0; i < result.files.length; i++) {
        var file = result.files[i];
        
        // Skip folders and scripts to reduce noise
        if (file.mimeType === 'application/vnd.google-apps.folder' || file.mimeType === 'application/vnd.google-apps.script') {
            Logger.log('Skipping ' + file.mimeType + ': ' + file.name);
            continue;
        }
        
        processDriveFileForComments(file, userEmail, secondaryEmail, cutoffString);
      }
    } else {
      Logger.log('No modified files found in this page.');
    }
    pageToken = result.nextPageToken;
  } while (pageToken);
}

function processDriveFileForComments(file, userEmail, secondaryEmail, since) {
  var fileId = file.id;
  var fileName = file.name;
  var fileUrl = file.webViewLink;
  var mimeType = file.mimeType;
  
  try {
    var pageToken = null;
    
    do {
      var commentsResponse = Drive.Comments.list(fileId, {
        fields: 'nextPageToken, comments(id, content, htmlContent, resolved, replies, author(displayName), assigneeEmailAddress, mentionedEmailAddresses)',
        pageSize: 100,
        pageToken: pageToken,
        startModifiedTime: since // Filter comments by same cutoff as files (e.g. 24h)
      });
      
      var comments = commentsResponse.comments;
      if (comments) {
        for (var i = 0; i < comments.length; i++) {
          var comment = comments[i];
          var assignee = comment.assigneeEmailAddress;
          
          // Fallback: If API doesn't return explicit assignee (common for external accounts),
          // check mentionedEmailAddresses for a match.
          if (!assignee && comment.mentionedEmailAddresses && secondaryEmail) {
              if (comment.mentionedEmailAddresses.indexOf(secondaryEmail) > -1) {
                  assignee = secondaryEmail;
              } else if (comment.mentionedEmailAddresses.indexOf(userEmail) > -1) {
                  assignee = userEmail;
              }
          }
          
          
          // Case 1: Open Assigned Comment -> Create Task
          // Fix: Check !comment.resolved because API might return undefined for false
          var isAssignedToSecondary = secondaryEmail && assignee === secondaryEmail;
          if (!comment.resolved && (assignee === userEmail || isAssignedToSecondary)) {
            if (!isCommentProcessed(comment.id)) {
              Logger.log('Found new assigned task in: ' + fileName + ' for ' + assignee);
              createTodoistTask(comment, fileId, fileName, fileUrl, assignee, secondaryEmail);
              markCommentProcessed(comment.id);
            }
          }
          // Case 2: Resolved Comment -> Close Task
          // Check if resolved and NOT marked as synced-closed yet
          else if (comment.resolved) {
              var props = PropertiesService.getUserProperties();
              // Check if we have a task mapped to this comment
              var taskId = props.getProperty('map_comment_' + comment.id);
              
              if (taskId && !props.getProperty('closed_task_' + taskId)) {
                  Logger.log('Found resolved comment ' + comment.id + '. Closing Todoist task ' + taskId);
                  closeTodoistTask(taskId);
                  props.setProperty('closed_task_' + taskId, 'true'); // Flag to avoid re-closing
              }
          }
        }
      }
      pageToken = commentsResponse.nextPageToken;
    } while (pageToken);
    
  } catch (e) {
    Logger.log('Error processing file ' + fileName + ': ' + e.message);
  }
}

function createTodoistTask(comment, fileId, fileName, fileUrl, assignee, secondaryEmail) {
  var token = PropertiesService.getScriptProperties().getProperty('TODOIST_API_TOKEN');
  if (!token) {
    Logger.log('Error: TODOIST_API_TOKEN not found.');
    return;
  }

  var content = "Review comment in " + fileName;
  if (comment.content) {
    content = comment.content;
  } else if (comment.htmlContent) {
      content = comment.htmlContent.replace(/<[^>]*>?/gm, '');
  }

  // Fix: Handle empty comments (e.g. assigned but no text) to avoid Todoist 400 error
  if (!content || content.trim() === "") {
      content = "Assigned Comment (No text)";
  }

  // Construct valid link
  // v3 webViewLink is usually the view link
  var commentLink = fileUrl; 
  // Append comment ID to link for direct access
  // Format usually: .../edit?disco=COMMENT_ID
  if (fileUrl.indexOf('?') > 0) {
      commentLink = fileUrl + "&disco=" + comment.id;
  } else {
      commentLink = fileUrl + "?disco=" + comment.id;
  }
  
  // User Request 1: Content should be just the comment text (no markdown link)
  var taskContent = content;

  // Refined Logic for "Blank Comment"
  // 1. Check if empty
  // 2. Check if it is JUST the email address (Google Docs behavior for blank assignments)
  var isEssentiallyEmpty = !taskContent || taskContent.trim().length === 0;
  var isJustEmail = assignee && taskContent && taskContent.indexOf(assignee) > -1 && taskContent.length < assignee.length + 5; // Simple heuristic

  if (isEssentiallyEmpty || isJustEmail) {
      Logger.log('Content identified as empty or just mention. Setting title to "Blank Comment".');
      taskContent = "Blank Comment";
  } else {
      // Logic Update: Prepend "Comment: " to avoid Todoist Smart Parsing issues
      // But user preferred "Blank Comment" for blanks. For non-blanks, we still need to be careful?
      // User asked: "change the title of the task to be Blank Comment *instead of* Comment:"
      // This implies they only saw "Comment: " when it was blank.
      // For normal text, we can probably leave it as is, or just ensure it's safe.
      // If we prepend "Comment: " to everything, it changes the title for real comments too.
      // Let's rely on the "Blank Comment" override for the problematic cases.
      // For normal cases, let's trust it won't be empty.
  }
  
  // User Request 2: Add URL link to name of the document (in description)
  var fileLinkMarkdown = "[" + fileName + "](" + commentLink + ")";
  
  // Add metadata footer to description for two-way sync
  // Format: [DocsSync:FILE_ID:COMMENT_ID]
  var syncTag = SYNC_TAG_PREFIX + fileId + ":" + comment.id + "]";
  var description = "Assigned in Google Doc: " + fileLinkMarkdown + "\n\n" + syncTag;

  // Define Labels
  var labels = ["Google Doc Comments"];
  // Fix: User wants ALL assignments labeled with the email, not just secondary.
  if (assignee) {
      labels.push(assignee);
  }

  // Create Task
  var url = 'https://api.todoist.com/rest/v2/tasks';
  var payload = {
    "content": taskContent,
    "description": description,
    "due_string": "today",
    "labels": labels // Labels array with potential secondary email
  };

  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var taskData = JSON.parse(response.getContentText());
    Logger.log('Created Todoist task: ' + content);
    
    // Store mapping for two-way sync
    if (taskData.id) {
        mapTaskToComment(taskData.id, fileId, comment.id);
    }
  } catch (e) {
    Logger.log('Failed to create Todoist task: ' + e.message);
  }
}

// ==========================================
// Part 3: Assigned Tasks (Smart Chips/Checklists) -> Todoist
// ==========================================

function syncAssignedTasks(userEmail, secondaryEmail) {
  try {
    // Optimization: Only look for tasks updated within SEARCH_HOURS (e.g. 24h)
    // This prevents re-scanning "all tasks ever created".
    var cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - SEARCH_HOURS);
    var updatedMin = cutoffDate.toISOString();
    
    // 1. Get all Task Lists
    var taskLists = Tasks.Tasklists.list().items;
    if (!taskLists) return;

    for (var i = 0; i < taskLists.length; i++) {
      var listId = taskLists[i].id;
      
      // 2. Get tasks with showAssigned=true to see Doc assignments
      // Filter by updatedMin to reduce noise
      var tasks = Tasks.Tasks.list(listId, {
        showAssigned: true,
        showCompleted: true, 
        showHidden: true,
        updatedMin: updatedMin 
      }).items;

      if (!tasks) continue;

      for (var j = 0; j < tasks.length; j++) {
        var task = tasks[j];
        
        // Check if it is a Document assignment
        if (task.assignmentInfo && task.assignmentInfo.surfaceType === 'DOCUMENT') {
             processAssignedTask(task, listId, userEmail, secondaryEmail);
        }
      }
    }
  } catch (e) {
    Logger.log('Error syncing assigned tasks: ' + e.message);
  }
}

function processAssignedTask(task, listId, userEmail, secondaryEmail) {
    // Check if map exists
    var props = PropertiesService.getUserProperties();
    
    // Fix: We now store mappings as ListID:TaskID for newer tasks, but legacy might match just TaskID.
    // We must check both.
    var compositeKey = listId + ":" + task.id;
    var existingTodoistId = props.getProperty('map_gtask_todoist_' + compositeKey);
    
    if (!existingTodoistId) {
        // Try legacy lookup (just Task ID)
        existingTodoistId = props.getProperty('map_gtask_todoist_' + task.id);
    }

    if (existingTodoistId) {
        // Logger.log('Found mapping for GTask ' + task.id + ' -> Todoist ' + existingTodoistId);
    } else {
        // Logger.log('No mapping found for GTask ' + task.id);
    }

    // Case 1: Task completed in Doc (GTask) -> Close in Todoist
    if (task.status === 'completed') {
        if (existingTodoistId) {
             // Check if we already marked it closed to avoid spamming API
             if (!props.getProperty('closed_todoist_task_' + existingTodoistId)) {
                 Logger.log('Google Task ' + task.id + ' is completed. Closing Todoist task ' + existingTodoistId);
                 closeTodoistTask(existingTodoistId);
                 props.setProperty('closed_todoist_task_' + existingTodoistId, 'true');
             }
        }
        return;
    }

    // Case 2: Task is Open
    if (existingTodoistId) {
        // Already synced and open. Determine if we need to update? 
        // For now, assume no updates needed unless we want to sync title changes.
        return;
    }

    // It's a new open assigned task
    if (isGoogleTaskProcessed(task.id)) {
        return; 
    }

    // Proceed to create
    var driveFileId = task.assignmentInfo.driveResourceInfo.driveFileId;
    var fileName = "Google Doc Task"; 
    var fileUrl = task.assignmentInfo.linkToTask;

    try {
        var file = DriveApp.getFileById(driveFileId);
        fileName = file.getName();
    } catch (e) {
        // Fallback
    }

    Logger.log('Found new assigned task from Doc: ' + fileName);
    createTodoistTaskFromGoogleTask(task, listId, driveFileId, fileName, fileUrl, userEmail, secondaryEmail);
    markGoogleTaskProcessed(task.id);
}

function createTodoistTaskFromGoogleTask(gTask, listId, fileId, fileName, fileUrl, assigneeEmail, secondaryEmail) {
  var token = PropertiesService.getScriptProperties().getProperty('TODOIST_API_TOKEN');
  if (!token) return;

  var content = gTask.title;
  var fileLinkMarkdown = "[" + fileName + "](" + fileUrl + ")";
  
  var syncTag = SYNC_TAG_PREFIX + "TASK:" + gTask.id + "]";
  var description = "Assigned in Google Doc: " + fileLinkMarkdown + "\n\n" + syncTag;

  var labels = ["Google Doc Tasks"]; 
  
  // Bug Fix: User wants the email labeled. 
  // Since we only sync tasks for the Active User (Tasks API limitation), 
  // we definitely label it with that email so they can filter.
  if (assigneeEmail) {
      labels.push(assigneeEmail);
  }

  var url = 'https://api.todoist.com/rest/v2/tasks';
  var payload = {
    "content": content,
    "description": description,
    "labels": labels
  };

  if (gTask.due) {
      var dueDate = new Date(gTask.due);
      var year = dueDate.getFullYear();
      var month = ("0" + (dueDate.getMonth() + 1)).slice(-2);
      var day = ("0" + dueDate.getDate()).slice(-2);
      payload.due_date = year + "-" + month + "-" + day;
  }

  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token,
      "Content-Type": "application/json"
    },
    "payload": JSON.stringify(payload)
  };

  try {
    var response = UrlFetchApp.fetch(url, options);
    var taskData = JSON.parse(response.getContentText());
    Logger.log('Created Todoist task for GTask: ' + gTask.title);
    
    if (taskData.id) {
        // Store as ListID:TaskID so we can resolve it later
        mapTodoistTaskToGoogleTask(taskData.id, listId + ":" + gTask.id);
    }
  } catch (e) {
    Logger.log('Failed to create Todoist task for GTask: ' + e.message);
  }
}

function resolveGoogleTask(gTaskId) {
    var listId, taskId;
    
    // Check if we have the new format (ListID:TaskID)
    if (gTaskId.indexOf(':') > -1) {
        var parts = gTaskId.split(':');
        listId = parts[0];
        taskId = parts[1];
    } else {
        // Legacy format: Just TaskID
        taskId = gTaskId;
    }

    // Attempt Resolution
    if (listId && taskId) {
        try {
            Tasks.Tasks.patch({ status: 'completed' }, listId, taskId);
            Logger.log('Successfully resolved Google Task: ' + taskId);
        } catch (e) {
            Logger.log('Failed to resolve Google Task ' + taskId + ' in list ' + listId + ': ' + e.message);
        }
    } else {
        // Fallback: We don't know the List ID, so we must search for it.
        // This handles cases from before the code update.
        Logger.log('Searching for Google Task ' + taskId + ' in all lists...');
        var taskLists = Tasks.Tasklists.list().items;
        var found = false;
        
        if (taskLists) {
             for (var i = 0; i < taskLists.length; i++) {
                 try {
                     // Try to get/patch the task in this list. 
                     // We use patch directly; if it exists, it updates. If not, it throws 404.
                     Tasks.Tasks.patch({ status: 'completed' }, taskLists[i].id, taskId);
                     Logger.log('Successfully resolved Google Task (via search): ' + taskId);
                     found = true;
                     break; 
                 } catch (e) {
                     // Task likely not in this list, continue searching
                 }
             }
        }
        
        if (!found) {
             Logger.log('Could not find or resolve Google Task: ' + taskId);
        }
    }
}

function getSecondaryEmail() {
  return PropertiesService.getScriptProperties().getProperty('SECONDARY_EMAIL');
}

function closeTodoistTask(taskId) {
  var token = PropertiesService.getScriptProperties().getProperty('TODOIST_API_TOKEN');
  if (!token) return;

  var url = 'https://api.todoist.com/rest/v2/tasks/' + taskId + '/close';
  var options = {
    "method": "post",
    "headers": {
      "Authorization": "Bearer " + token
    }
  };

  try {
    UrlFetchApp.fetch(url, options);
    Logger.log('Closed Todoist task: ' + taskId);
  } catch (e) {
    Logger.log('Failed to close Todoist task ' + taskId + ': ' + e.message);
  }
}

// ==========================================
// Part 2: Todoist -> Docs (Completions)
// ==========================================

function checkTodoistCompletions() {
  var token = PropertiesService.getScriptProperties().getProperty('TODOIST_API_TOKEN');
  if (!token) return;

  var props = PropertiesService.getUserProperties();
  var lastCheckStr = props.getProperty('last_completion_check');
  var since;
  if (lastCheckStr) {
      since = lastCheckStr; // ISO string
  } else {
      // Default to 24 hours ago if first run
      var d = new Date();
      d.setHours(d.getHours() - 24);
      since = d.toISOString();
  }

  var url = 'https://api.todoist.com/sync/v9/completed/get_all';
  var params = {
    'since': since,
    'limit': 50
  };
  
  var queryString = Object.keys(params).map(function(key) {
    return key + '=' + encodeURIComponent(params[key]);
  }).join('&');
  
  var options = {
    "method": "get",
    "headers": {
      "Authorization": "Bearer " + token
    }
  };

  try {
    var response = UrlFetchApp.fetch(url + "?" + queryString, options);
    var data = JSON.parse(response.getContentText());
    
    var items = data.items;
    if (!items || items.length === 0) {
        props.setProperty('last_completion_check', new Date().toISOString());
        return;
    }

    for (var i = 0; i < items.length; i++) {
        var item = items[i];
        checkAndResolveComment(item);
    }
    
    props.setProperty('last_completion_check', new Date().toISOString());

  } catch (e) {
    Logger.log('Error checking completed tasks: ' + e.message);
  }
}

function resolveGoogleDocComment(fileId, commentId) {
  try {
    // Drive API v3: To resolve, use replies.create with action='resolve'
    // Resource for reply
    var resource = {
      content: "Marked as complete via Todoist Sync.",
      action: "resolve" // v3 uses 'action'='resolve'
    };
    
    // Drive.Replies.create(resource, fileId, commentId, optionalArgs)
    Drive.Replies.create(resource, fileId, commentId, {
        fields: 'id, action'
    });
    Logger.log('Successfully resolved comment: ' + commentId);
    
  } catch (e) {
    Logger.log('Failed to resolve comment: ' + e.message);
  }
}

// ==========================================
// Helpers
// ==========================================

function isCommentProcessed(commentId) {
  var props = PropertiesService.getUserProperties();
  return props.getProperty('comment_' + commentId) != null;
}

function markCommentProcessed(commentId) {
  var props = PropertiesService.getUserProperties();
  props.setProperty('comment_' + commentId, new Date().toISOString());
}

function mapTaskToComment(taskId, fileId, commentId) {
    var props = PropertiesService.getUserProperties();
    // Map Task -> Comment (For Todoist completion -> Docs resolution)
    props.setProperty('map_task_' + taskId, fileId + ":" + commentId);
    
  // Map Comment -> Task (For Docs resolution -> Todoist completion)
    props.setProperty('map_comment_' + commentId, taskId);
}

function isGoogleTaskProcessed(gTaskId) {
  var props = PropertiesService.getUserProperties();
  return props.getProperty('gtask_' + gTaskId) != null;
}

function markGoogleTaskProcessed(gTaskId) {
  var props = PropertiesService.getUserProperties();
  props.setProperty('gtask_' + gTaskId, new Date().toISOString());
}

function mapTodoistTaskToGoogleTask(todoistTaskId, gTaskId) {
    var props = PropertiesService.getUserProperties();
    // Todoist -> GTask
    props.setProperty('map_todoist_gtask_' + todoistTaskId, gTaskId);
    // GTask -> Todoist (Needed for checking GTask completions)
    props.setProperty('map_gtask_todoist_' + gTaskId, todoistTaskId);
}
