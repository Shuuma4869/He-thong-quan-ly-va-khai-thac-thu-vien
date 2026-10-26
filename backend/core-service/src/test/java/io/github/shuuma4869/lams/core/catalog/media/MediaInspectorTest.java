package io.github.shuuma4869.lams.core.catalog.media;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.net.http.HttpClient;
import java.net.http.HttpHeaders;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import io.github.shuuma4869.lams.core.identity.application.AuthFailure;

class MediaInspectorTest {
    private MediaRequest request() {
        return new MediaRequest("open-library","OL1M","https://openlibrary.org/books/OL1M",
                "https://covers.openlibrary.org/b/id/1-L.jpg","Permission","https://openlibrary.org/books/OL1M",
                "Artist","ISBN checked",true,null);
    }

    @SuppressWarnings("unchecked")
    private HttpClient response(int status, String mime, byte[] bytes) {
        var client=mock(HttpClient.class);
        HttpResponse<byte[]> response=mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(status);
        when(response.headers()).thenReturn(HttpHeaders.of(Map.of("Content-Type",List.of(mime)),(name,value)->true));
        when(response.body()).thenReturn(bytes);
        when(client.<byte[]>sendAsync(any(),any())).thenReturn(CompletableFuture.completedFuture(response));
        return client;
    }

    @Test void acceptsSupportedSignaturesAndReturnsActualSize() {
        var jpeg=new byte[]{(byte)255,(byte)216,(byte)255};
        var png=new byte[]{(byte)137,80,78,71,13,10,26,10};
        var webp="RIFF0000WEBP".getBytes(java.nio.charset.StandardCharsets.US_ASCII);
        for (var entry:Map.of("image/jpeg",jpeg,"image/png",png,"image/webp",webp).entrySet()) {
            var output=new MediaInspector(response(200,entry.getKey(),entry.getValue())).inspect(request());
            assertThat(output.mime()).isEqualTo(entry.getKey());
            assertThat(output.byteSize()).isEqualTo(entry.getValue().length);
        }
    }

    @Test void standardEbooksCoverRequiresItsOwnHostAndManualEvidence() {
        var cover = new MediaRequest("standard-ebooks", "jane-austen/pride-and-prejudice",
                "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice",
                "https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice/downloads/cover.jpg",
                "CC0", "https://standardebooks.org/about/standard-ebooks-and-the-public-domain",
                "Standard Ebooks", "Đã đối chiếu tác phẩm và trang nguồn", true, null);
        var jpeg = new byte[]{(byte)255,(byte)216,(byte)255};
        assertThat(new MediaInspector(response(200,"image/jpeg",jpeg)).inspect(cover).mime()).isEqualTo("image/jpeg");
        var wrongHost = new MediaRequest("standard-ebooks", cover.sourceId(), cover.sourceUrl(),
                "https://standardebooks.org.evil.test/cover.jpg", cover.license(), cover.licenseUrl(),
                cover.attribution(), cover.evidence(), true, null);
        var client = mock(HttpClient.class);
        assertThatThrownBy(() -> new MediaInspector(client).inspect(wrongHost))
                .isInstanceOfSatisfying(AuthFailure.class, error -> assertThat(error.status()).isEqualTo(422));
        verifyNoInteractions(client);
    }

    @ParameterizedTest @ValueSource(strings={"image/jpeg","image/png","image/webp","image/svg+xml","text/html"})
    void rejectsSpoofedOrUnsupportedMime(String mime) {
        assertThatThrownBy(()->new MediaInspector(response(200,mime,"<svg/>".getBytes())).inspect(request()))
                .isInstanceOfSatisfying(AuthFailure.class,error->assertThat(error.status()).isEqualTo(422));
    }

    @Test void rejectsRedirectWithoutFollowingIt() {
        var client=response(302,"image/jpeg",new byte[]{(byte)255,(byte)216,(byte)255});
        assertThatThrownBy(()->new MediaInspector(client).inspect(request())).isInstanceOf(AuthFailure.class);
        verify(client).sendAsync(any(),any());
    }

    @Test @SuppressWarnings("unchecked")
    void cancelsSlowResponseBodyAtDeadlineAndReleasesCapacity() throws Exception {
        var client=mock(HttpClient.class);
        CompletableFuture<HttpResponse<byte[]>> pending=mock(CompletableFuture.class);
        when(client.<byte[]>sendAsync(any(),any())).thenReturn(pending);
        when(pending.get(6,TimeUnit.SECONDS)).thenThrow(new TimeoutException());
        var inspector=new MediaInspector(client);
        for(int i=0;i<5;i++) assertThatThrownBy(()->inspector.inspect(request()))
                .isInstanceOfSatisfying(AuthFailure.class,error->assertThat(error.status()).isEqualTo(422));
        verify(pending,times(5)).cancel(true);
    }

    @Test void boundedSubscriberRejectsStreamingBodyOverTwoMiB() {
        var subscriber=new MediaInspector.BoundedSubscriber();
        var subscription=mock(Flow.Subscription.class);
        subscriber.onSubscribe(subscription);
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[2*1024*1024])));
        assertThat(subscriber.getBody().toCompletableFuture()).isNotDone();
        subscriber.onNext(List.of(ByteBuffer.wrap(new byte[1])));
        verify(subscription).cancel();
        assertThat(subscriber.getBody().toCompletableFuture()).isCompletedExceptionally();
    }
    @ParameterizedTest
    @ValueSource(strings={"http://127.0.0.1/a.jpg","https://localhost/a.jpg","https://covers.openlibrary.org.evil.test/a.jpg",
            "https://user:password@covers.openlibrary.org/a.jpg","https://covers.openlibrary.org:444/a.jpg","file:///C:/secret","https://upload.wikimedia.org/photo.jpg"})
    void rejectsUntrustedImageUrlWithoutNetwork(String url) {
        var client=mock(HttpClient.class);
        var request=new MediaRequest("open-library","OL1M","https://openlibrary.org/books/OL1M",url,
                "Permission","https://openlibrary.org/books/OL1M","Artist","ISBN checked",true,null);
        assertThatThrownBy(()->new MediaInspector(client).inspect(request)).isInstanceOfSatisfying(AuthFailure.class,
                failure->assertThat(failure.status()).isEqualTo(422));
        verifyNoInteractions(client);
    }
}
