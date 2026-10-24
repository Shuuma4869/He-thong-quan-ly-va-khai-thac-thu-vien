package io.github.shuuma4869.lams.core.circulation.shared;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class CirculationClock {
    @Bean Clock circulationTime() { return Clock.systemUTC(); }
}
