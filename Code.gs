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
var SECONDARY_EMAIL = 'mikegustafson@gmail.com'; // Additional email to monitor

function syncDocsToTodoist() {
  var userEmail = Session.getActiveUser().getEmail();
  Logger.log('Running sync for user: ' + userEmail + ' and ' + SECONDARY_EMAIL);

  // Part 1: Docs -> Todoist
  syncAssignedComments(userEmail);

  // Part 2: Todoist -> Docs (Completions)
  checkTodoistCompletions();
}


// ==========================================
// Part 1: Docs -> Todoist
// ==========================================

function syncAssignedComments(userEmail) {
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
        
        processDriveFileForComments(file, userEmail);
      }
    } else {
      Logger.log('No modified files found in this page.');
    }
    pageToken = result.nextPageToken;
  } while (pageToken);
}

function processDriveFileForComments(file, userEmail) {
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
        pageToken: pageToken
      });
      
      var comments = commentsResponse.comments;
      if (comments) {
        for (var i = 0; i < comments.length; i++) {
          var comment = comments[i];
          var assignee = comment.assigneeEmailAddress;
          
          // Fallback: If API doesn't return explicit assignee (common for external accounts),
          // check mentionedEmailAddresses for a match.
          if (!assignee && comment.mentionedEmailAddresses) {
              if (comment.mentionedEmailAddresses.indexOf(SECONDARY_EMAIL) > -1) {
                  assignee = SECONDARY_EMAIL;
              } else if (comment.mentionedEmailAddresses.indexOf(userEmail) > -1) {
                  assignee = userEmail;
              }
          }
          
          // Case 1: Open Assigned Comment -> Create Task
          // Fix: Check !comment.resolved because API might return undefined for false
          if (!comment.resolved && (assignee === userEmail || assignee === SECONDARY_EMAIL)) {
            if (!isCommentProcessed(comment.id)) {
              Logger.log('Found new assigned task in: ' + fileName + ' for ' + assignee);
              createTodoistTask(comment, fileId, fileName, fileUrl, assignee);
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

function createTodoistTask(comment, fileId, fileName, fileUrl, assignee) {
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
  
  // User Request 2: Add URL link to name of the document (in description)
  var fileLinkMarkdown = "[" + fileName + "](" + commentLink + ")";
  
  // Add metadata footer to description for two-way sync
  // Format: [DocsSync:FILE_ID:COMMENT_ID]
  var syncTag = SYNC_TAG_PREFIX + fileId + ":" + comment.id + "]";
  var description = "Assigned in Google Doc: " + fileLinkMarkdown + "\n\n" + syncTag;

  // Define Labels
  var labels = ["Google Doc Comments"];
  if (assignee === SECONDARY_EMAIL) {
      labels.push(SECONDARY_EMAIL);
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

function checkAndResolveComment(item) {
  var props = PropertiesService.getUserProperties();
  var mapping = props.getProperty('map_task_' + item.task_id);
  var fileId, commentId;
    
  if (mapping) {
      var parts = mapping.split(':');
      fileId = parts[0];
      commentId = parts[1];
  } else {
      return; 
  }
    
  if (fileId && commentId) {
      Logger.log('Resolving comment ' + commentId + ' for task ' + item.task_id);
      resolveGoogleDocComment(fileId, commentId);
      props.deleteProperty('map_task_' + item.task_id);
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
