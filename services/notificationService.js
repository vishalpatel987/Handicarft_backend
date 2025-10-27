const Notification = require('../models/Notification');
const nodemailer = require('nodemailer');
const { broadcastToUser, broadcastToAdmins } = require('../socket/socketHandler');

// Email transporter setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

class NotificationService {
  // Create a new notification
  static async createNotification(notificationData) {
    try {
      const notification = new Notification(notificationData);
      await notification.save();
      
      // Send notification through configured channels
      await this.sendNotification(notification);
      
      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Send notification through all configured channels
  static async sendNotification(notification) {
    try {
      const promises = [];

      // Send email notification
      if (notification.recipientEmail) {
        promises.push(this.sendEmailNotification(notification));
      }

      // Send in-app notification
      promises.push(this.sendInAppNotification(notification));

      // Send SMS notification (if configured)
      if (notification.channels.sms && notification.recipientEmail) {
        promises.push(this.sendSMSNotification(notification));
      }

      // Send push notification (if configured)
      if (notification.channels.push) {
        promises.push(this.sendPushNotification(notification));
      }

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  }

  // Send email notification
  static async sendEmailNotification(notification) {
    try {
      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: notification.recipientEmail,
        subject: notification.title,
        html: this.generateEmailTemplate(notification)
      };

      await transporter.sendMail(mailOptions);
      await notification.markAsDelivered('email');
      
      console.log(`Email notification sent to ${notification.recipientEmail}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
      await notification.markAsFailed('email', error.message);
    }
  }

  // Send in-app notification
  static async sendInAppNotification(notification) {
    try {
      // Send via WebSocket
      if (global.io) {
        if (notification.recipientType === 'user' && notification.recipientId) {
          broadcastToUser(global.io, notification.recipientId, 'new_notification', {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            category: notification.category,
            actionUrl: notification.actionUrl,
            actionText: notification.actionText,
            createdAt: notification.createdAt
          });
        } else if (notification.recipientType === 'admin') {
          broadcastToAdmins(global.io, 'new_notification', {
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            category: notification.category,
            actionUrl: notification.actionUrl,
            actionText: notification.actionText,
            createdAt: notification.createdAt
          });
        }
      }

      await notification.markAsDelivered('inApp');
      console.log(`In-app notification sent to ${notification.recipientId || 'admins'}`);
    } catch (error) {
      console.error('Error sending in-app notification:', error);
      await notification.markAsFailed('inApp', error.message);
    }
  }

  // Send SMS notification (placeholder - integrate with SMS service)
  static async sendSMSNotification(notification) {
    try {
      // TODO: Integrate with SMS service like Twilio, AWS SNS, etc.
      console.log(`SMS notification would be sent to ${notification.recipientEmail}`);
      await notification.markAsDelivered('sms');
    } catch (error) {
      console.error('Error sending SMS notification:', error);
      await notification.markAsFailed('sms', error.message);
    }
  }

  // Send push notification (placeholder - integrate with FCM)
  static async sendPushNotification(notification) {
    try {
      // TODO: Integrate with Firebase Cloud Messaging or similar
      console.log(`Push notification would be sent to ${notification.recipientId}`);
      await notification.markAsDelivered('push');
    } catch (error) {
      console.error('Error sending push notification:', error);
      await notification.markAsFailed('push', error.message);
    }
  }

  // Generate email template
  static generateEmailTemplate(notification) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${notification.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8B5CF6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .button { display: inline-block; background: #8B5CF6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${notification.title}</h1>
          </div>
          <div class="content">
            <p>${notification.message}</p>
            ${notification.actionUrl ? `
              <a href="${baseUrl}${notification.actionUrl}" class="button">
                ${notification.actionText || 'View Details'}
              </a>
            ` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from RikoCraft Support System.</p>
            <p>If you have any questions, please contact our support team.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  // Support-specific notification methods
  static async notifySupportQuerySubmitted(query) {
    const notification = await this.createNotification({
      title: 'Support Query Submitted',
      message: `Your support query "${query.subject}" has been submitted successfully. We'll get back to you soon.`,
      type: 'success',
      category: 'support_query',
      recipientId: query.userId,
      recipientEmail: query.userEmail,
      recipientType: 'user',
      relatedEntityType: 'support_query',
      relatedEntityId: query._id.toString(),
      actionUrl: `/support?tab=queries&query=${query._id}`,
      actionText: 'View Query',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });

    // Notify admins
    await this.createNotification({
      title: 'New Support Query',
      message: `New support query from ${query.userName}: "${query.subject}"`,
      type: 'info',
      category: 'support_query',
      recipientType: 'admin',
      relatedEntityType: 'support_query',
      relatedEntityId: query._id.toString(),
      actionUrl: `/admin/customer-support?tab=queries&query=${query._id}`,
      actionText: 'View Query',
      priority: 'high',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });

    return notification;
  }

  static async notifySupportQueryResponse(query, response) {
    return await this.createNotification({
      title: 'Support Query Response',
      message: `You have received a response to your support query "${query.subject}".`,
      type: 'info',
      category: 'support_query',
      recipientId: query.userId,
      recipientEmail: query.userEmail,
      recipientType: 'user',
      relatedEntityType: 'support_query',
      relatedEntityId: query._id.toString(),
      actionUrl: `/support?tab=queries&query=${query._id}`,
      actionText: 'View Response',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });
  }

  static async notifySupportTicketCreated(ticket) {
    const notification = await this.createNotification({
      title: 'Support Ticket Created',
      message: `Your support ticket ${ticket.ticketNumber} has been created successfully.`,
      type: 'success',
      category: 'support_ticket',
      recipientId: ticket.userId,
      recipientEmail: ticket.userEmail,
      recipientType: 'user',
      relatedEntityType: 'support_ticket',
      relatedEntityId: ticket._id.toString(),
      actionUrl: `/support?tab=tickets&ticket=${ticket._id}`,
      actionText: 'View Ticket',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });

    // Notify admins
    await this.createNotification({
      title: 'New Support Ticket',
      message: `New support ticket ${ticket.ticketNumber} from ${ticket.userName}: "${ticket.title}"`,
      type: 'info',
      category: 'support_ticket',
      recipientType: 'admin',
      relatedEntityType: 'support_ticket',
      relatedEntityId: ticket._id.toString(),
      actionUrl: `/admin/customer-support?tab=tickets&ticket=${ticket._id}`,
      actionText: 'View Ticket',
      priority: 'high',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });

    return notification;
  }

  static async notifySupportTicketUpdate(ticket, updateMessage) {
    return await this.createNotification({
      title: 'Support Ticket Updated',
      message: `Your support ticket ${ticket.ticketNumber} has been updated: ${updateMessage}`,
      type: 'info',
      category: 'support_ticket',
      recipientId: ticket.userId,
      recipientEmail: ticket.userEmail,
      recipientType: 'user',
      relatedEntityType: 'support_ticket',
      relatedEntityId: ticket._id.toString(),
      actionUrl: `/support?tab=tickets&ticket=${ticket._id}`,
      actionText: 'View Ticket',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });
  }

  static async notifyChatMessage(chatRoom, message, senderName) {
    // Notify all participants except the sender
    const notifications = [];
    
    for (const participant of chatRoom.participants) {
      if (participant.userId !== message.senderId) {
        const notification = await this.createNotification({
          title: 'New Chat Message',
          message: `${senderName}: ${message.message.substring(0, 100)}${message.message.length > 100 ? '...' : ''}`,
          type: 'info',
          category: 'support_chat',
          recipientId: participant.userId,
          recipientEmail: participant.userEmail,
          recipientType: 'user',
          relatedEntityType: 'support_chat',
          relatedEntityId: chatRoom._id.toString(),
          actionUrl: `/support?tab=chat&room=${chatRoom._id}`,
          actionText: 'View Chat',
          channels: {
            inApp: { sent: true }
          }
        });
        notifications.push(notification);
      }
    }

    return notifications;
  }

  // Order-related notifications
  static async notifyOrderStatusUpdate(order, newStatus) {
    const statusMessages = {
      'processing': 'Your order is being processed',
      'confirmed': 'Your order has been confirmed',
      'manufacturing': 'Your order is being manufactured',
      'shipped': 'Your order has been shipped',
      'delivered': 'Your order has been delivered',
      'cancelled': 'Your order has been cancelled'
    };

    return await this.createNotification({
      title: 'Order Status Update',
      message: `Order #${order.orderNumber}: ${statusMessages[newStatus] || 'Status updated'}`,
      type: newStatus === 'cancelled' ? 'error' : 'info',
      category: 'order_update',
      recipientId: order.userId,
      recipientEmail: order.userEmail,
      recipientType: 'user',
      relatedEntityType: 'order',
      relatedEntityId: order._id.toString(),
      actionUrl: `/account?tab=orders&order=${order._id}`,
      actionText: 'View Order',
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });
  }

  // System notifications
  static async notifySystemMaintenance(message, scheduledTime) {
    return await this.createNotification({
      title: 'System Maintenance',
      message: message,
      type: 'warning',
      category: 'system',
      recipientType: 'all',
      scheduledFor: scheduledTime,
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });
  }

  // Promotion notifications
  static async notifyPromotion(promotion) {
    return await this.createNotification({
      title: promotion.title,
      message: promotion.message,
      type: 'promotion',
      category: 'promotion',
      recipientType: 'all',
      actionUrl: promotion.actionUrl,
      actionText: promotion.actionText,
      expiresAt: promotion.expiresAt,
      channels: {
        email: { sent: true },
        inApp: { sent: true }
      }
    });
  }

  // Get user notifications
  static async getUserNotifications(userId, limit = 20, skip = 0) {
    return await Notification.getUserNotifications(userId, limit, skip);
  }

  // Mark notification as read
  static async markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({
      _id: notificationId,
      recipientId: userId
    });

    if (notification) {
      await notification.markAsRead();
      return notification;
    }

    throw new Error('Notification not found');
  }

  // Get unread count
  static async getUnreadCount(userId) {
    return await Notification.getUnreadCount(userId);
  }

  // Cleanup expired notifications
  static async cleanupExpired() {
    return await Notification.cleanupExpired();
  }
}

module.exports = NotificationService;
