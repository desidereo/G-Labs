<?php
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    // 1. Honeypot Check (Anti-Spam)
    // If the hidden 'website_url' field is filled, it's a bot.
    if (!empty($_POST["website_url"])) {
        // Log the attempt or just exit silently
        die("System error. Please try again later."); 
    }

    // Collect and sanitize input
    $name = strip_tags(trim($_POST["name"]));
    $email = filter_var(trim($_POST["email"]), FILTER_SANITIZE_EMAIL);
    $subject = strip_tags(trim($_POST["subject"]));
    $message = trim($_POST["message"]);
    $platform = isset($_POST["platform"]) ? strip_tags(trim($_POST["platform"])) : "";

    // 2. Spam Keyword Filter
    $spam_keywords = [
        'seo service', 'web design', 'rank your website', 
        'improve your ranking', 'marketing proposal', 
        'viagra', 'casino', 'lottery', 'cryptocurrency investment scheme',
        'passive income from home', 'make money online'
    ];
    
    foreach ($spam_keywords as $keyword) {
        if (stripos($message, $keyword) !== false) {
            die("System error. Please try again later.");
        }
    }

    // 3. Link Count Check (More than 3 links is usually spam)
    if (substr_count($message, 'http') > 3 || substr_count($message, 'www.') > 3) {
         die("System error. Please try again later.");
    }

    // Basic validation
    if (empty($name) || empty($message) || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        echo "<script>alert('Please complete the form correctly and try again.'); window.history.back();</script>";
        exit;
    }

    // Email configuration
    $recipient = "info@g-labs.software";
    $email_subject = "New Contact from Website: $subject";
    
    // Build the email content
    $email_content = "Name: $name\n";
    $email_content .= "Email: $email\n";
    if (!empty($platform)) {
        $email_content .= "Platform: $platform\n";
    }
    $email_content .= "\n";
    $email_content .= "Message:\n$message\n";

    // Build the email headers
    $email_headers = "From: $name <$email>\r\n";
    $email_headers .= "Reply-To: $email\r\n";
    $email_headers .= "X-Mailer: PHP/" . phpversion();

    // Send the email
    if (mail($recipient, $email_subject, $email_content, $email_headers)) {
        // Success: Redirect back to contact page with success message (simulated via JS alert for now)
        echo "<script>alert('Thank you! Your message has been sent successfully.'); window.location.href='contact.html';</script>";
    } else {
        // Failure
        echo "<script>alert('Oops! Something went wrong and we couldn\'t send your message. Please try again later or email us directly.'); window.history.back();</script>";
    }
} else {
    // Not a POST request, redirect to the form
    header("Location: contact.html");
    exit;
}
?>