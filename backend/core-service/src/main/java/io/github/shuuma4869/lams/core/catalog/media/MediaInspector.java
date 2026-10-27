package io.github.shuuma4869.lams.core.catalog.media;

import io.github.shuuma4869.lams.core.identity.application.AuthFailure;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.stereotype.Component;

@Component
public class MediaInspector {
    public record Inspection(String mime, int byteSize) {}
    private final HttpClient client;
    private final Semaphore inFlight = new Semaphore(4);
    public MediaInspector() {
        this(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).followRedirects(HttpClient.Redirect.NEVER).build());
    }
    MediaInspector(HttpClient client) { this.client=client; }
    public Inspection inspect(MediaRequest request) {
        Set<String> imageHosts = switch (request.source()) {
            case "open-library" -> Set.of("covers.openlibrary.org");
            case "google-books" -> Set.of("books.google.com");
            case "wikimedia" -> Set.of("upload.wikimedia.org");
            case "standard-ebooks" -> Set.of("standardebooks.org");
            default -> throw invalid();
        };
        Set<String> sourceHosts = switch (request.source()) {
            case "open-library" -> Set.of("openlibrary.org");
            case "google-books" -> Set.of("books.google.com");
            case "standard-ebooks" -> Set.of("standardebooks.org");
            default -> Set.of("commons.wikimedia.org");
        };
        URI image = url(request.imageUrl(), imageHosts);
        url(request.sourceUrl(), sourceHosts);
        url(request.licenseUrl(), Set.of("creativecommons.org", "commons.wikimedia.org", "openlibrary.org",
                "archive.org", "developers.google.com", "books.google.com", "standardebooks.org"));
        if (!inFlight.tryAcquire()) throw new AuthFailure(429,"Đang có nhiều yêu cầu kiểm tra ảnh; vui lòng thử lại.");
        try {
            var pending = client.sendAsync(HttpRequest.newBuilder(image).timeout(Duration.ofSeconds(6))
                    .header("User-Agent", "LAMS/0.1 (manual media verification)").GET().build(),
                    info -> new BoundedSubscriber());
            HttpResponse<byte[]> response;
            try { response = pending.get(6, TimeUnit.SECONDS); }
            finally { if (!pending.isDone()) pending.cancel(true); }
            if (response.statusCode() != 200) throw new AuthFailure(422,"Không truy xuất được ảnh nguồn; không chấp nhận redirect.");
            String mime=response.headers().firstValue("Content-Type").orElse("").split(";")[0].trim().toLowerCase(java.util.Locale.ROOT);
            byte[] bytes=response.body();
            boolean valid=switch (mime) {
                case "image/jpeg" -> bytes.length>=3 && bytes[0]==(byte)0xff && bytes[1]==(byte)0xd8 && bytes[2]==(byte)0xff;
                case "image/png" -> bytes.length>=8 && java.util.Arrays.equals(java.util.Arrays.copyOf(bytes,8), new byte[]{(byte)137,80,78,71,13,10,26,10});
                case "image/webp" -> bytes.length>=12 && new String(bytes,0,4,java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                        && new String(bytes,8,4,java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP");
                default -> false;
            };
            if (!valid) throw invalid();
            return new Inspection(mime,bytes.length);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt(); throw new AuthFailure(503,"Kiểm tra ảnh bị gián đoạn.");
        } catch (ExecutionException | TimeoutException error) {
            throw new AuthFailure(422,"Ảnh nguồn lỗi, quá lớn hoặc quá thời gian kiểm tra.");
        } finally { inFlight.release(); }
    }
    private static URI url(String value, Set<String> hosts) {
        try {
            URI uri=URI.create(value);
            if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo()!=null || uri.getPort()!=-1
                    || uri.getFragment()!=null || !hosts.contains(uri.getHost())) throw invalid();
            return uri;
        } catch (IllegalArgumentException error) { throw invalid(); }
    }
    private static AuthFailure invalid() { return new AuthFailure(422,"Nguồn ảnh, giấy phép hoặc định dạng ảnh không hợp lệ."); }

    static class BoundedSubscriber implements HttpResponse.BodySubscriber<byte[]> {
        private final HttpResponse.BodySubscriber<byte[]> delegate=HttpResponse.BodySubscribers.ofByteArray();
        private Flow.Subscription subscription;
        private long received;
        public CompletionStage<byte[]> getBody() { return delegate.getBody(); }
        public void onSubscribe(Flow.Subscription subscription) { this.subscription=subscription; delegate.onSubscribe(subscription); }
        public void onNext(List<ByteBuffer> chunks) {
            for (var chunk:chunks) received+=chunk.remaining();
            if (received>2*1024*1024) { subscription.cancel(); delegate.onError(new java.io.IOException("Image exceeds size limit")); }
            else delegate.onNext(chunks);
        }
        public void onError(Throwable error) { delegate.onError(error); }
        public void onComplete() { delegate.onComplete(); }
    }
}
